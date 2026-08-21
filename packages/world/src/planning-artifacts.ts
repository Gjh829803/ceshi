import type { Diagnostic, Vec2Tuple } from "@whitebox-world/contracts";

import { hashString } from "./random";
import type { CompiledOutdoorScene } from "./scene";
import { isTerrainSurface, sampleTerrainSlopeDegrees, type TerrainSurface } from "./terrain";
import type {
  OutdoorWorldSpec,
  PlannedLandmark,
  PlannedRoute,
  PlannedTerrainRegion,
  PlannedWaterBody,
} from "./world-spec";

export interface PlanningArtifactHeader {
  artifactVersion: 1;
  sceneId: string;
  sceneSeed: number;
  specHash: string;
  compiler: "whitebox-world-planning-v1";
}

export interface TopDownPlanArtifact extends PlanningArtifactHeader {
  kind: "top-down-plan";
  bounds: {
    center: Vec2Tuple;
    size: Vec2Tuple;
    minimum: Vec2Tuple;
    maximum: Vec2Tuple;
  };
  spawn: Vec2Tuple;
  facingRadians: number;
  terrainRegions: readonly PlannedTerrainRegion[];
  water: readonly PlannedWaterBody[];
  landmarks: readonly PlannedLandmark[];
  routes: readonly PlannedRoute[];
  builtFeatureIds: readonly string[];
}

export interface HeightSlopeRouteCheck {
  routeId: string;
  samples: number;
  steepestDegrees: number;
  steepestAt?: Vec2Tuple;
  limitDegrees: number;
  pass: boolean;
}

export interface HeightSlopePlanArtifact extends PlanningArtifactHeader {
  kind: "height-slope-plan";
  terrainFeatureId: string;
  grid: {
    columns: number;
    rows: number;
    spacing: Vec2Tuple;
    heights: readonly (number | null)[];
    slopesDegrees: readonly (number | null)[];
  };
  stats: {
    minimumHeight: number;
    maximumHeight: number;
    maximumSlopeDegrees: number;
  };
  routeChecks: readonly HeightSlopeRouteCheck[];
}

export interface DerivedWorldPlanArtifacts {
  topDown: TopDownPlanArtifact;
  heightSlope: HeightSlopePlanArtifact;
  diagnostics: readonly Diagnostic[];
}

export interface PlanningArtifactOptions {
  sampleSpacingMeters?: number;
  maxGridDimension?: number;
}

function requireSpec(scene: CompiledOutdoorScene): OutdoorWorldSpec {
  if (scene.worldSpec === undefined) {
    throw new Error(`Scene ${scene.definition.id} has no WorldSpec.`);
  }
  return scene.worldSpec;
}

function primaryTerrain(scene: CompiledOutdoorScene): {
  featureId: string;
  surface: TerrainSurface;
} {
  const handle = scene.terrainHandles[0];
  if (handle === undefined) throw new Error(`Scene ${scene.definition.id} has no terrain.`);
  const resource = scene.registry.getResource<TerrainSurface>(handle.terrainId);
  if (!isTerrainSurface(resource?.value)) {
    throw new Error(`Scene ${scene.definition.id} primary terrain is unavailable.`);
  }
  return { featureId: handle.id, surface: resource.value };
}

function header(scene: CompiledOutdoorScene, spec: OutdoorWorldSpec): PlanningArtifactHeader {
  const sceneSeed = typeof scene.definition.seed === "number"
    ? scene.definition.seed >>> 0
    : hashString(scene.definition.seed ?? scene.definition.id);
  return {
    artifactVersion: 1,
    sceneId: scene.definition.id,
    sceneSeed,
    specHash: hashString(JSON.stringify(spec)).toString(16).padStart(8, "0"),
    compiler: "whitebox-world-planning-v1",
  };
}

function sampleRoute(
  terrain: TerrainSurface,
  route: PlannedRoute,
  spacing: number,
): HeightSlopeRouteCheck {
  let samples = 0;
  let steepestDegrees = 0;
  let steepestAt: Vec2Tuple | undefined;
  for (let index = 1; index < route.pointsMetersXZ.length; index += 1) {
    const from = route.pointsMetersXZ[index - 1];
    const to = route.pointsMetersXZ[index];
    if (from === undefined || to === undefined) continue;
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const steps = Math.max(1, Math.ceil(length / spacing));
    for (let step = index === 1 ? 0 : 1; step <= steps; step += 1) {
      const amount = step / steps;
      const point: Vec2Tuple = [
        from[0] + (to[0] - from[0]) * amount,
        from[1] + (to[1] - from[1]) * amount,
      ];
      const slope = sampleTerrainSlopeDegrees(terrain, point[0], point[1], Math.min(2, spacing));
      if (slope === undefined) continue;
      samples += 1;
      if (slope > steepestDegrees) {
        steepestDegrees = slope;
        steepestAt = point;
      }
    }
  }
  return {
    routeId: route.id,
    samples,
    steepestDegrees,
    ...(steepestAt === undefined ? {} : { steepestAt }),
    limitDegrees: route.maximumDesignSlopeDegrees,
    pass: samples > 0 && steepestDegrees <= route.maximumDesignSlopeDegrees,
  };
}

export function deriveWorldPlanArtifacts(
  scene: CompiledOutdoorScene,
  options: PlanningArtifactOptions = {},
): DerivedWorldPlanArtifacts {
  const spec = requireSpec(scene);
  const terrain = primaryTerrain(scene);
  const desiredSpacing = options.sampleSpacingMeters ?? 8;
  const maxGridDimension = Math.max(2, Math.floor(options.maxGridDimension ?? 256));
  if (!(desiredSpacing > 0) || !Number.isFinite(desiredSpacing)) {
    throw new RangeError("Planning sample spacing must be finite and greater than zero.");
  }
  const columns = Math.min(maxGridDimension, Math.ceil(terrain.surface.width / desiredSpacing) + 1);
  const rows = Math.min(maxGridDimension, Math.ceil(terrain.surface.depth / desiredSpacing) + 1);
  const spacingX = terrain.surface.width / Math.max(1, columns - 1);
  const spacingZ = terrain.surface.depth / Math.max(1, rows - 1);
  const minimumX = terrain.surface.origin[0] - terrain.surface.width / 2;
  const minimumZ = terrain.surface.origin[1] - terrain.surface.depth / 2;
  const heights: Array<number | null> = [];
  const slopes: Array<number | null> = [];
  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  let maximumSlopeDegrees = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = minimumX + column * spacingX;
      const z = minimumZ + row * spacingZ;
      const height = terrain.surface.sampleHeight(x, z);
      const slope = sampleTerrainSlopeDegrees(
        terrain.surface,
        x,
        z,
        Math.max(0.5, Math.min(spacingX, spacingZ) / 2),
      );
      heights.push(height ?? null);
      slopes.push(slope ?? null);
      if (height !== undefined) {
        minimumHeight = Math.min(minimumHeight, height);
        maximumHeight = Math.max(maximumHeight, height);
      }
      if (slope !== undefined) maximumSlopeDegrees = Math.max(maximumSlopeDegrees, slope);
    }
  }
  if (!Number.isFinite(minimumHeight) || !Number.isFinite(maximumHeight)) {
    minimumHeight = 0;
    maximumHeight = 0;
  }

  const routeChecks = spec.routes.map((route) => sampleRoute(terrain.surface, route, desiredSpacing / 2));
  const diagnostics: Diagnostic[] = routeChecks
    .filter((route) => !route.pass)
    .map((route) => ({
      severity: "error" as const,
      code: "WORLD_SPEC_ROUTE_PLANNING_EVIDENCE",
      message: route.samples === 0
        ? `planning-evidence: route ${route.routeId} has no valid terrain samples. This is not route playability.`
        : `planning-evidence: route ${route.routeId} heightfield slope ${route.steepestDegrees.toFixed(1)}° exceeds planned maximumDesignSlopeDegrees ${route.limitDegrees}°. This is not route playability.`,
      suggestions: ["Flatten/smooth the route corridor or update the planned route deliberately."],
    }));
  if (
    minimumHeight < spec.bounds.heightRange[0] - 1e-6 ||
    maximumHeight > spec.bounds.heightRange[1] + 1e-6
  ) {
    diagnostics.push({
      severity: "error",
      code: "WORLD_SPEC_HEIGHT_RANGE_MISMATCH",
      message: `Built terrain height range ${minimumHeight.toFixed(2)}..${maximumHeight.toFixed(2)} exceeds planned ${spec.bounds.heightRange[0]}..${spec.bounds.heightRange[1]}.`,
      suggestions: ["Update the planned range deliberately or correct the terrain operations."],
    });
  }
  const sharedHeader = header(scene, spec);
  return {
    topDown: {
      ...sharedHeader,
      kind: "top-down-plan",
      bounds: {
        center: terrain.surface.origin,
        size: [terrain.surface.width, terrain.surface.depth],
        minimum: [minimumX, minimumZ],
        maximum: [minimumX + terrain.surface.width, minimumZ + terrain.surface.depth],
      },
      spawn: [scene.spawn.position[0], scene.spawn.position[2]],
      facingRadians: scene.spawn.facingRadians,
      terrainRegions: spec.terrain.regions,
      water: spec.water,
      landmarks: spec.landmarks,
      routes: spec.routes,
      builtFeatureIds: scene.registry.list().map((feature) => feature.id),
    },
    heightSlope: {
      ...sharedHeader,
      kind: "height-slope-plan",
      terrainFeatureId: terrain.featureId,
      grid: {
        columns,
        rows,
        spacing: [spacingX, spacingZ],
        heights,
        slopesDegrees: slopes,
      },
      stats: { minimumHeight, maximumHeight, maximumSlopeDegrees },
      routeChecks,
    },
    diagnostics,
  };
}
