import type { AuthoringSpecV4 } from "@whitebox-world/authoring";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  applyTerrainConstraints,
  type TerrainConstraintDelta,
} from "./constraints/apply-terrain-constraints";
import { decodeTerrainIntentPng } from "./canonicalization/decode-png";
import { deriveTerrainConstraintsFromAuthoringV4 } from
  "./constraints/derive-authoring-constraints";
import { mapSignedHeightRatiosToMeters } from "./raster/map-height-meters";
import {
  normalizeSignedHeightRaster,
  type NormalizedSignedHeightRaster,
} from "./raster/normalize-signed-height-raster";
import { prefilterScalarRasterForDownsample } from
  "./raster/prefilter-scalar-raster";
import { projectSignedHeightIntentRgb } from
  "./canonicalization/project-signed-rgb";
import { quantizeUnprotectedTerrainHeightSamplesMeters } from
  "./raster/quantize-height-samples";
import { resampleScalarRasterBilinear } from
  "./raster/resample-scalar-raster";
import {
  summarizeTerrainIntentProjection,
  type TerrainIntentProjectionSummary,
} from "./canonicalization/summarize-projection";
import type { TerrainIntentDiagnostic } from
  "./constraints/terrain-constraint-types";

type Sha256Hash = `sha256:${string}`;

const LARGE_GRID_SAMPLE_THRESHOLD = 120_000;
const LARGE_GRID_BASE_SAMPLE_QUANTUM_METERS = 0.1;

export const TERRAIN_HEIGHT_INTENT_NORMALIZATION_PROFILE =
  "signed-diverging-blue-gray-orange-median-datum@1" as const;
export const TERRAIN_HEIGHT_INTENT_COMPILER_VERSION =
  "terrain-height-intent-compiler@1" as const;

export interface TerrainHeightIntentCompileReport {
  readonly kind: "worldkit-terrain-height-intent-compile-report";
  readonly schemaVersion: 1;
  readonly status: "passed" | "failed";
  readonly terrainEntityId: string;
  readonly sourcePngHash: Sha256Hash;
  readonly canonicalRgbHash: Sha256Hash;
  readonly inputAuthoringSpecHash: Sha256Hash;
  readonly outputAuthoringSpecHash?: Sha256Hash;
  readonly projection: TerrainIntentProjectionSummary;
  readonly prefilter?: Readonly<{
    kind: "separable-box";
    radiusPixelsXY: readonly [number, number];
  }>;
  readonly normalization?: Readonly<{
    profileId: typeof TERRAIN_HEIGHT_INTENT_NORMALIZATION_PROFILE;
    medianHeightRatioBefore: number;
    heightRatioOffsetApplied: number;
    inputRange: readonly [minimum: number, maximum: number];
    outputRange: readonly [minimum: number, maximum: number];
    clampedSampleCount: number;
  }>;
  readonly baseSampleQuantization?: Readonly<{
    quantumMeters: number;
    quantizedSampleCount: number;
    protectedSampleCount: number;
  }>;
  readonly constraintDeltas: readonly TerrainConstraintDelta[];
  readonly diagnostics: readonly TerrainIntentDiagnostic[];
}

export interface CompileTerrainHeightIntentResult {
  readonly report: TerrainHeightIntentCompileReport;
  readonly compiledAuthoringSpec?: AuthoringSpecV4;
}

export interface CompileTerrainHeightIntentInput {
  readonly sourcePngBytes: Uint8Array;
  readonly authoringSpec: AuthoringSpecV4;
}

function hasBlockingDiagnostic(diagnostics: readonly TerrainIntentDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "blocking");
}

function failedResult(input: {
  readonly terrainEntityId: string;
  readonly sourcePngHash: Sha256Hash;
  readonly canonicalRgbHash: Sha256Hash;
  readonly inputAuthoringSpecHash: Sha256Hash;
  readonly projection: TerrainIntentProjectionSummary;
  readonly prefilter?: TerrainHeightIntentCompileReport["prefilter"];
  readonly normalization?: NormalizedSignedHeightRaster;
  readonly constraintDeltas?: readonly TerrainConstraintDelta[];
  readonly diagnostics: readonly TerrainIntentDiagnostic[];
}): CompileTerrainHeightIntentResult {
  return {
    report: {
      kind: "worldkit-terrain-height-intent-compile-report",
      schemaVersion: 1,
      status: "failed",
      terrainEntityId: input.terrainEntityId,
      sourcePngHash: input.sourcePngHash,
      canonicalRgbHash: input.canonicalRgbHash,
      inputAuthoringSpecHash: input.inputAuthoringSpecHash,
      projection: input.projection,
      ...(input.prefilter === undefined ? {} : { prefilter: input.prefilter }),
      ...(input.normalization === undefined
        ? {}
        : {
            normalization: {
              profileId: TERRAIN_HEIGHT_INTENT_NORMALIZATION_PROFILE,
              medianHeightRatioBefore:
                input.normalization.medianHeightRatioBefore,
              heightRatioOffsetApplied:
                input.normalization.heightRatioOffsetApplied,
              inputRange: input.normalization.inputRange,
              outputRange: input.normalization.outputRange,
              clampedSampleCount: input.normalization.clampedSampleCount,
            },
          }),
      constraintDeltas: input.constraintDeltas ?? [],
      diagnostics: input.diagnostics,
    },
  };
}

export async function compileTerrainHeightIntent(
  input: CompileTerrainHeightIntentInput,
): Promise<CompileTerrainHeightIntentResult> {
  const canonicalRgb = await decodeTerrainIntentPng(input.sourcePngBytes);
  const projection = projectSignedHeightIntentRgb({
    widthPixels: canonicalRgb.widthPixels,
    heightPixels: canonicalRgb.heightPixels,
    rgbBytes: canonicalRgb.rgbBytes,
  });
  const projectionSummary = summarizeTerrainIntentProjection(projection);
  const inputAuthoringSpecHash = sha256CanonicalJson(input.authoringSpec) as Sha256Hash;
  const derived = deriveTerrainConstraintsFromAuthoringV4(input.authoringSpec);

  if (hasBlockingDiagnostic(derived.diagnostics)) {
    return failedResult({
      terrainEntityId: derived.terrainEntityId,
      sourcePngHash: canonicalRgb.sourcePngHash,
      canonicalRgbHash: canonicalRgb.canonicalRgbHash,
      inputAuthoringSpecHash,
      projection: projectionSummary,
      diagnostics: derived.diagnostics,
    });
  }

  const terrain = input.authoringSpec.nodes.find(
    (node) => node.kind === "terrain" && node.id === derived.terrainEntityId,
  );
  if (terrain?.kind !== "terrain") {
    return failedResult({
      terrainEntityId: derived.terrainEntityId,
      sourcePngHash: canonicalRgb.sourcePngHash,
      canonicalRgbHash: canonicalRgb.canonicalRgbHash,
      inputAuthoringSpecHash,
      projection: projectionSummary,
      diagnostics: [{
        severity: "blocking",
        code: "TERRAIN_INTENT_TERRAIN_REFERENCE_NOT_FOUND",
        instancePath: "/nodes",
        message: `Terrain '${derived.terrainEntityId}' was not found after constraint derivation.`,
      }],
    });
  }

  const minimumHeightMeters = input.authoringSpec.world.bounds.heightRangeMeters[0];
  const maximumHeightMeters = input.authoringSpec.world.bounds.heightRangeMeters[1];
  const datumHeightMeters = terrain.components.terrain.source.baseHeightMeters!;
  if (
    !Number.isFinite(minimumHeightMeters) ||
    !Number.isFinite(datumHeightMeters) ||
    !Number.isFinite(maximumHeightMeters) ||
    minimumHeightMeters >= datumHeightMeters ||
    datumHeightMeters >= maximumHeightMeters
  ) {
    return failedResult({
      terrainEntityId: terrain.id,
      sourcePngHash: canonicalRgb.sourcePngHash,
      canonicalRgbHash: canonicalRgb.canonicalRgbHash,
      inputAuthoringSpecHash,
      projection: projectionSummary,
      diagnostics: [{
        severity: "blocking",
        code: "TERRAIN_INTENT_HEIGHT_RANGE_INVALID",
        instancePath: "/world/bounds/heightRangeMeters",
        message: "Terrain height range must strictly contain the explicit baseHeightMeters datum.",
        details: { minimumHeightMeters, datumHeightMeters, maximumHeightMeters },
      }],
    });
  }

  const prefiltered = prefilterScalarRasterForDownsample(
    {
      columns: projection.widthPixels,
      rows: projection.heightPixels,
      values: projection.heightRatios,
    },
    terrain.components.terrain.grid.resolutionCellsXZ,
  );
  const normalization = normalizeSignedHeightRaster(prefiltered.values);
  const ratioGrid = resampleScalarRasterBilinear(
    { ...prefiltered, values: normalization.values },
    terrain.components.terrain.grid.resolutionCellsXZ,
  );
  const metricGrid = mapSignedHeightRatiosToMeters({
    heightRatios: ratioGrid.values,
    minimumHeightMeters,
    datumHeightMeters,
    maximumHeightMeters,
  });
  const constrained = applyTerrainConstraints({
    centerMetersXZ: terrain.components.terrain.grid.centerMetersXZ,
    sizeMetersXZ: terrain.components.terrain.grid.sizeMetersXZ,
    heightRangeMeters: input.authoringSpec.world.bounds.heightRangeMeters,
    resolutionVerticesXZ: terrain.components.terrain.grid.resolutionCellsXZ,
    heightSamplesMeters: metricGrid,
    constraints: derived.constraints,
  });
  const diagnostics = [...derived.diagnostics, ...constrained.diagnostics];

  if (hasBlockingDiagnostic(diagnostics)) {
    return failedResult({
      terrainEntityId: terrain.id,
      sourcePngHash: canonicalRgb.sourcePngHash,
      canonicalRgbHash: canonicalRgb.canonicalRgbHash,
      inputAuthoringSpecHash,
      projection: projectionSummary,
      prefilter: {
        kind: "separable-box",
        radiusPixelsXY: prefiltered.radiusPixelsXY,
      },
      normalization,
      constraintDeltas: constrained.deltas,
      diagnostics,
    });
  }

  const compiledAuthoringSpec = structuredClone(input.authoringSpec);
  const compiledTerrain = compiledAuthoringSpec.nodes.find(
    (node) => node.kind === "terrain" && node.id === terrain.id,
  );
  if (compiledTerrain?.kind !== "terrain") {
    throw new Error("TERRAIN_INTENT_INTERNAL_TERRAIN_CLONE_MISSING");
  }
  const baseSampleQuantization = constrained.heightSamplesMeters.length >
      LARGE_GRID_SAMPLE_THRESHOLD
    ? quantizeUnprotectedTerrainHeightSamplesMeters({
        heightSamplesMeters: constrained.heightSamplesMeters,
        protectedSampleMask: constrained.protectedSampleMask,
        quantumMeters: LARGE_GRID_BASE_SAMPLE_QUANTUM_METERS,
      })
    : undefined;
  compiledTerrain.components.terrain.grid.heightSamplesMeters =
    baseSampleQuantization?.heightSamplesMeters ??
    Array.from(constrained.heightSamplesMeters);
  const outputAuthoringSpecHash = sha256CanonicalJson(compiledAuthoringSpec) as Sha256Hash;

  return {
    report: {
      kind: "worldkit-terrain-height-intent-compile-report",
      schemaVersion: 1,
      status: "passed",
      terrainEntityId: terrain.id,
      sourcePngHash: canonicalRgb.sourcePngHash,
      canonicalRgbHash: canonicalRgb.canonicalRgbHash,
      inputAuthoringSpecHash,
      outputAuthoringSpecHash,
      projection: projectionSummary,
      prefilter: {
        kind: "separable-box",
        radiusPixelsXY: prefiltered.radiusPixelsXY,
      },
      normalization: {
        profileId: TERRAIN_HEIGHT_INTENT_NORMALIZATION_PROFILE,
        medianHeightRatioBefore: normalization.medianHeightRatioBefore,
        heightRatioOffsetApplied: normalization.heightRatioOffsetApplied,
        inputRange: normalization.inputRange,
        outputRange: normalization.outputRange,
        clampedSampleCount: normalization.clampedSampleCount,
      },
      ...(baseSampleQuantization === undefined
        ? {}
        : {
            baseSampleQuantization: {
              quantumMeters: LARGE_GRID_BASE_SAMPLE_QUANTUM_METERS,
              quantizedSampleCount: baseSampleQuantization.quantizedSampleCount,
              protectedSampleCount: baseSampleQuantization.protectedSampleCount,
            },
          }),
      constraintDeltas: constrained.deltas,
      diagnostics,
    },
    compiledAuthoringSpec,
  };
}
