import type { AuthoringSpecV4 } from "@whitebox-world/authoring";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  applyTerrainConstraintsV0,
  type TerrainConstraintDeltaV0,
} from "./apply-terrain-constraints";
import { decodeTerrainIntentPngV0 } from "./decode-png";
import { deriveTerrainConstraintsFromAuthoringV4 } from "./derive-authoring-constraints";
import { mapSignedHeightRatiosToMetersV0 } from "./map-height-meters";
import { prefilterScalarRasterForDownsampleV0 } from "./prefilter-scalar-raster";
import { projectSignedHeightIntentRgbV0 } from "./project-signed-rgb";
import { resampleScalarRasterBilinearV0 } from "./resample-scalar-raster";
import {
  summarizeTerrainIntentProjectionV0,
  type TerrainIntentProjectionSummaryV0,
} from "./summarize-projection";
import type { TerrainIntentDiagnosticV0 } from "./terrain-constraint-types";

type Sha256HashV0 = `sha256:${string}`;

export interface TerrainHeightIntentCompileReportV0 {
  readonly schemaVersion: 1;
  readonly status: "passed" | "failed";
  readonly terrainEntityId: string;
  readonly sourcePngHash: Sha256HashV0;
  readonly canonicalRgbHash: Sha256HashV0;
  readonly inputAuthoringSpecHash: Sha256HashV0;
  readonly outputAuthoringSpecHash?: Sha256HashV0;
  readonly projection: TerrainIntentProjectionSummaryV0;
  readonly prefilter?: Readonly<{
    kind: "separable-box";
    radiusPixelsXY: readonly [number, number];
  }>;
  readonly constraintDeltas: readonly TerrainConstraintDeltaV0[];
  readonly diagnostics: readonly TerrainIntentDiagnosticV0[];
}

export interface CompileTerrainHeightIntentResultV0 {
  readonly report: TerrainHeightIntentCompileReportV0;
  readonly compiledAuthoringSpec?: AuthoringSpecV4;
}

function hasBlockingDiagnostic(diagnostics: readonly TerrainIntentDiagnosticV0[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "blocking");
}

function failedResult(input: {
  readonly terrainEntityId: string;
  readonly sourcePngHash: Sha256HashV0;
  readonly canonicalRgbHash: Sha256HashV0;
  readonly inputAuthoringSpecHash: Sha256HashV0;
  readonly projection: TerrainIntentProjectionSummaryV0;
  readonly prefilter?: TerrainHeightIntentCompileReportV0["prefilter"];
  readonly constraintDeltas?: readonly TerrainConstraintDeltaV0[];
  readonly diagnostics: readonly TerrainIntentDiagnosticV0[];
}): CompileTerrainHeightIntentResultV0 {
  return {
    report: {
      schemaVersion: 1,
      status: "failed",
      terrainEntityId: input.terrainEntityId,
      sourcePngHash: input.sourcePngHash,
      canonicalRgbHash: input.canonicalRgbHash,
      inputAuthoringSpecHash: input.inputAuthoringSpecHash,
      projection: input.projection,
      ...(input.prefilter === undefined ? {} : { prefilter: input.prefilter }),
      constraintDeltas: input.constraintDeltas ?? [],
      diagnostics: input.diagnostics,
    },
  };
}

export async function compileTerrainHeightIntentV0(input: {
  readonly sourcePngBytes: Uint8Array;
  readonly authoringSpec: AuthoringSpecV4;
}): Promise<CompileTerrainHeightIntentResultV0> {
  const canonicalRgb = await decodeTerrainIntentPngV0(input.sourcePngBytes);
  const projection = projectSignedHeightIntentRgbV0({
    widthPixels: canonicalRgb.widthPixels,
    heightPixels: canonicalRgb.heightPixels,
    rgbBytes: canonicalRgb.rgbBytes,
  });
  const projectionSummary = summarizeTerrainIntentProjectionV0(projection);
  const inputAuthoringSpecHash = sha256CanonicalJson(input.authoringSpec) as Sha256HashV0;
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

  const prefiltered = prefilterScalarRasterForDownsampleV0(
    {
      columns: projection.widthPixels,
      rows: projection.heightPixels,
      values: projection.heightRatios,
    },
    terrain.components.terrain.grid.resolutionCellsXZ,
  );
  const ratioGrid = resampleScalarRasterBilinearV0(
    prefiltered,
    terrain.components.terrain.grid.resolutionCellsXZ,
  );
  const metricGrid = mapSignedHeightRatiosToMetersV0({
    heightRatios: ratioGrid.values,
    minimumHeightMeters,
    datumHeightMeters,
    maximumHeightMeters,
  });
  const constrained = applyTerrainConstraintsV0({
    centerMetersXZ: terrain.components.terrain.grid.centerMetersXZ,
    sizeMetersXZ: terrain.components.terrain.grid.sizeMetersXZ,
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
  compiledTerrain.components.terrain.grid.heightSamplesMeters =
    Array.from(constrained.heightSamplesMeters);
  const outputAuthoringSpecHash = sha256CanonicalJson(compiledAuthoringSpec) as Sha256HashV0;

  return {
    report: {
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
      constraintDeltas: constrained.deltas,
      diagnostics,
    },
    compiledAuthoringSpec,
  };
}
