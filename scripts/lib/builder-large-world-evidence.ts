import type { AuthoringSpecV4 } from "@whitebox-world/authoring";
import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  estimateRouteBuildWindowTileCountV1,
  resolveTraversalGraphBuilderProfileV2,
  TraversalGraphBuildBudgetExceededErrorV1,
} from "@whitebox-world/traversal";

const ORDINARY_WORLD_TARGET_MAXIMUM_VERTICES_V1 = 120_000;
const LARGE_WORLD_MAXIMUM_RESOLUTION_VERTICES_PER_AXIS_V1 = 1024;
const RECOMMENDED_MINIMUM_CELL_SIZE_METERS_V1 = 1.25;
const RECOMMENDED_MAXIMUM_CELL_SIZE_METERS_V1 = 2.5;

export interface BuilderTerrainScaleEvidenceV1 {
  readonly terrainEntityId: string;
  readonly sizeMetersXZ: readonly [number, number];
  readonly resolutionVerticesXZ: readonly [number, number];
  readonly cellSizeMetersXZ: readonly [number, number];
  readonly terrainVertexCount: number;
  readonly terrainTriangleCount: number;
  readonly operationalProfile:
    | "ordinary-single-heightfield-v1"
    | "large-single-heightfield-v1"
    | "outside-large-single-heightfield-v1";
  readonly recommendedCellSizeRangeSatisfied: boolean;
}

export type BuilderRouteBuildWindowEvidenceV1 = Readonly<{
  constraintId: string;
  routeId: string;
  minimumMetersXZ: readonly [number, number];
  maximumMetersXZ: readonly [number, number];
  tilesX: number;
  tilesZ: number;
  estimatedTiles: number;
  maximumTiles: number;
  status: "admitted" | "budget-exceeded";
}>;

export interface BuilderLargeWorldDiagnosticV1 {
  readonly code:
    | "ROUTE_BUILD_WINDOW_BUDGET_EXCEEDED"
    | "ROUTE_BUILD_WINDOW_ESTIMATE_INVALID";
  readonly message: string;
  readonly instancePath: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface BuilderLargeWorldEvidenceV1 {
  readonly terrainScaleEvidence: BuilderTerrainScaleEvidenceV1;
  readonly routeBuildWindowEvidence: readonly BuilderRouteBuildWindowEvidenceV1[];
  readonly diagnostics: readonly BuilderLargeWorldDiagnosticV1[];
}

function compareCanonicalString(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function terrainScaleEvidence(
  authoringSpec: AuthoringSpecV4,
): BuilderTerrainScaleEvidenceV1 {
  const terrains = authoringSpec.nodes.filter((node) => node.kind === "terrain");
  if (terrains.length !== 1) {
    throw new Error("BUILDER_LARGE_WORLD_TERRAIN_CARDINALITY_INVALID");
  }
  const terrain = terrains[0]!;
  const sizeMetersXZ = terrain.components.terrain.grid.sizeMetersXZ;
  const resolutionVerticesXZ = terrain.components.terrain.grid.resolutionCellsXZ;
  const cellSizeMetersXZ = [
    sizeMetersXZ[0] / (resolutionVerticesXZ[0] - 1),
    sizeMetersXZ[1] / (resolutionVerticesXZ[1] - 1),
  ] as const;
  const terrainVertexCount = resolutionVerticesXZ[0] * resolutionVerticesXZ[1];
  const terrainTriangleCount =
    (resolutionVerticesXZ[0] - 1) * (resolutionVerticesXZ[1] - 1) * 2;
  const recommendedCellSizeRangeSatisfied = cellSizeMetersXZ.every(
    (cellSizeMeters) =>
      cellSizeMeters >= RECOMMENDED_MINIMUM_CELL_SIZE_METERS_V1 &&
      cellSizeMeters <= RECOMMENDED_MAXIMUM_CELL_SIZE_METERS_V1,
  );
  const isInsideLargeProfile = resolutionVerticesXZ.every(
    (resolutionVertices) =>
      resolutionVertices <= LARGE_WORLD_MAXIMUM_RESOLUTION_VERTICES_PER_AXIS_V1,
  ) && cellSizeMetersXZ.every(
    (cellSizeMeters) => cellSizeMeters <= RECOMMENDED_MAXIMUM_CELL_SIZE_METERS_V1,
  );
  return {
    terrainEntityId: terrain.id,
    sizeMetersXZ: [...sizeMetersXZ],
    resolutionVerticesXZ: [...resolutionVerticesXZ],
    cellSizeMetersXZ,
    terrainVertexCount,
    terrainTriangleCount,
    operationalProfile: terrainVertexCount <= ORDINARY_WORLD_TARGET_MAXIMUM_VERTICES_V1
      ? "ordinary-single-heightfield-v1"
      : isInsideLargeProfile
        ? "large-single-heightfield-v1"
        : "outside-large-single-heightfield-v1",
    recommendedCellSizeRangeSatisfied,
  };
}

export function collectBuilderLargeWorldEvidenceV1(
  authoringSpec: AuthoringSpecV4,
): BuilderLargeWorldEvidenceV1 {
  const scaleEvidence = terrainScaleEvidence(authoringSpec);
  const profile = resolveTraversalGraphBuilderProfileV2(
    BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  ).profile;
  const routesById = new Map(
    authoringSpec.spatial.routes.map((route) => [route.id, route] as const),
  );
  const routeBuildWindowEvidence: BuilderRouteBuildWindowEvidenceV1[] = [];
  const diagnostics: BuilderLargeWorldDiagnosticV1[] = [];
  const connectivity = [...authoringSpec.constraints.connectivity].sort(
    (left, right) =>
      compareCanonicalString(left.id, right.id) ||
      compareCanonicalString(left.routeId, right.routeId),
  );

  for (const constraint of connectivity) {
    const route = routesById.get(constraint.routeId);
    const instancePath = `/constraints/connectivity/${constraint.id}`;
    if (route === undefined) {
      diagnostics.push({
        code: "ROUTE_BUILD_WINDOW_ESTIMATE_INVALID",
        message: `Required route '${constraint.routeId}' is unavailable for build-window estimation.`,
        instancePath,
        details: {
          constraintId: constraint.id,
          routeId: constraint.routeId,
        },
      });
      continue;
    }
    try {
      const estimate = estimateRouteBuildWindowTileCountV1({
        pointsMetersXZ: route.pointsMetersXZ,
        widthMeters: route.widthMeters,
        terrainCellSizeMetersXZ: scaleEvidence.cellSizeMetersXZ,
        tileSizeCells: profile.tileSizeCells,
        voxelCellSizeMeters: profile.voxelCellSizeMeters,
        maximumTiles: profile.maximumTiles,
      });
      routeBuildWindowEvidence.push({
        constraintId: constraint.id,
        routeId: route.id,
        ...estimate,
        status: "admitted",
      });
    } catch (error) {
      if (error instanceof TraversalGraphBuildBudgetExceededErrorV1) {
        routeBuildWindowEvidence.push({
          constraintId: constraint.id,
          routeId: route.id,
          minimumMetersXZ: error.minimumMetersXZ,
          maximumMetersXZ: error.maximumMetersXZ,
          tilesX: error.tilesX,
          tilesZ: error.tilesZ,
          estimatedTiles: error.estimatedTiles,
          maximumTiles: error.maximumTiles,
          status: "budget-exceeded",
        });
        diagnostics.push({
          code: "ROUTE_BUILD_WINDOW_BUDGET_EXCEEDED",
          message: `Required route '${route.id}' exceeds the trusted single-build Tile budget; split it into ordered segments that share explicit seam Anchors.`,
          instancePath,
          details: {
            constraintId: constraint.id,
            routeId: route.id,
            tilesX: error.tilesX,
            tilesZ: error.tilesZ,
            estimatedTiles: error.estimatedTiles,
            maximumTiles: error.maximumTiles,
            minimumMetersXZ: error.minimumMetersXZ,
            maximumMetersXZ: error.maximumMetersXZ,
            repair: "split-with-shared-seam-anchors",
          },
        });
      } else {
        diagnostics.push({
          code: "ROUTE_BUILD_WINDOW_ESTIMATE_INVALID",
          message: error instanceof Error ? error.message : String(error),
          instancePath,
          details: {
            constraintId: constraint.id,
            routeId: route.id,
          },
        });
      }
    }
  }

  return {
    terrainScaleEvidence: scaleEvidence,
    routeBuildWindowEvidence,
    diagnostics,
  };
}
