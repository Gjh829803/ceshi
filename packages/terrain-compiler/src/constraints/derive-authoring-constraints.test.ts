import type { AuthoringSpecV4 } from "@whitebox-world/authoring";
import { describe, expect, it } from "vitest";

import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import { deriveTerrainConstraintsFromAuthoringV4 } from "./derive-authoring-constraints";

function focusedAuthoringSpec(): AuthoringSpecV4 {
  const source = createValidAuthoringSpec();
  return {
    ...source,
    spatial: {
      ...source.spatial,
      regions: [{
        id: "spawn-region",
        kind: "polygon-xz",
        pointsMetersXZ: [[-2, 28], [2, 28], [2, 32], [-2, 32]],
        semanticClassId: "region.spawn",
      }],
      routes: [{
        id: "main-route",
        kind: "polyline-xz",
        pointsMetersXZ: [[0, 30], [4, 10], [12, -10]],
        widthMeters: 3,
        locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      }],
    },
    resources: {
      ...source.resources,
      prototypes: source.resources.prototypes.map((prototype) => ({
        ...prototype,
        semantic: { classId: "landmark.wall" },
      })),
    },
    nodes: source.nodes.map((node) => {
      if (node.kind === "terrain") {
        return {
          ...node,
          components: {
            terrain: {
              ...node.components.terrain,
              source: { ...node.components.terrain.source, baseHeightMeters: 2 },
            },
          },
        };
      }
      if (node.kind === "water") {
        return {
          ...node,
          components: {
            water: { ...node.components.water, waterLevelMeters: 1 },
          },
        };
      }
      return node;
    }),
    constraints: {
      connectivity: [],
      placements: [
        {
          id: "spawn-inside",
          kind: "inside-region",
          requirement: "required",
          entityId: "spawn-main",
          regionId: "spawn-region",
          boundaryClearanceMeters: 1,
        },
        {
          id: "landmark-supported",
          kind: "supported-by",
          requirement: "required",
          supportedEntityId: "wall-east",
          supportingEntityId: "terrain-main",
          maximumSupportGapMeters: 0,
          minimumSupportRatio: 1,
        },
        {
          id: "route-slope",
          kind: "within-slope-limit",
          requirement: "required",
          routeId: "main-route",
          terrainEntityId: "terrain-main",
          maximumSlopeDegrees: 12,
        },
      ],
    },
  };
}

function blockingCodes(spec: AuthoringSpecV4): string[] {
  return deriveTerrainConstraintsFromAuthoringV4(spec).diagnostics
    .filter((diagnostic) => diagnostic.severity === "blocking")
    .map((diagnostic) => diagnostic.code);
}

describe("deriveTerrainConstraintsFromAuthoringV4", () => {
  it("derives stable priority-ordered constraints only from required Authoring evidence", () => {
    expect(deriveTerrainConstraintsFromAuthoringV4(focusedAuthoringSpec())).toEqual({
      terrainEntityId: "terrain-main",
      constraints: [
        {
          id: "lake-main",
          kind: "water-basin",
          boundary: {
            kind: "ellipse",
            centerMetersXZ: [25, 0],
            radiusMetersXZ: [12, 18],
          },
          waterLevelMeters: 1,
          depthMeters: 3,
          shoreWidthMeters: 4,
        },
        {
          id: "spawn-inside",
          kind: "flatten-region",
          pointsMetersXZ: [[-2, 28], [2, 28], [2, 32], [-2, 32]],
          targetHeightMeters: 0,
          falloffWidthMeters: 1,
          role: "spawn",
        },
        {
          id: "landmark-supported",
          kind: "flatten-footprint",
          centerMetersXZ: [12, 10],
          sizeMetersXZ: [2, 14],
          falloffWidthMeters: 0,
          role: "landmark-support",
        },
        {
          id: "route-slope",
          kind: "route-slope",
          pointsMetersXZ: [[0, 30], [4, 10], [12, -10]],
          widthMeters: 3,
          maximumSlopeDegrees: 12,
        },
      ],
      diagnostics: [],
    });
  });

  it("requires an explicit terrain datum and an unambiguous single Terrain", () => {
    const missingDatum = focusedAuthoringSpec();
    const terrain = missingDatum.nodes.find((node) => node.kind === "terrain");
    if (terrain?.kind !== "terrain") throw new Error("TEST_TERRAIN_MISSING");
    delete terrain.components.terrain.source.baseHeightMeters;
    expect(blockingCodes(missingDatum)).toContain("TERRAIN_INTENT_BASE_HEIGHT_REQUIRED");

    const multipleTerrain = focusedAuthoringSpec();
    const existingTerrain = multipleTerrain.nodes.find((node) => node.kind === "terrain");
    if (existingTerrain?.kind !== "terrain") throw new Error("TEST_TERRAIN_MISSING");
    multipleTerrain.nodes.push({ ...structuredClone(existingTerrain), id: "terrain-other" });
    expect(blockingCodes(multipleTerrain)).toContain("TERRAIN_INTENT_TERRAIN_COUNT_AMBIGUOUS");
  });

  it("blocks missing placement evidence and unresolved Region or Route references", () => {
    const missingSpawnPlacement = focusedAuthoringSpec();
    const spawn = missingSpawnPlacement.nodes.find((node) => node.id === "spawn-main");
    if (spawn?.kind !== "anchor") throw new Error("TEST_SPAWN_MISSING");
    spawn.placement = { kind: "solved", placementConstraintIds: ["spawn-inside"] };
    expect(blockingCodes(missingSpawnPlacement)).toContain(
      "TERRAIN_INTENT_SPAWN_PLACEMENT_REQUIRED",
    );

    const missingLandmarkPlacement = focusedAuthoringSpec();
    const landmark = missingLandmarkPlacement.nodes.find((node) => node.id === "wall-east");
    if (landmark?.kind !== "object") throw new Error("TEST_LANDMARK_MISSING");
    landmark.placement = {
      kind: "solved",
      placementConstraintIds: ["landmark-supported"],
    };
    expect(blockingCodes(missingLandmarkPlacement)).toContain(
      "TERRAIN_INTENT_LANDMARK_PLACEMENT_REQUIRED",
    );

    const missingReferences = focusedAuthoringSpec();
    missingReferences.spatial.regions = [];
    missingReferences.spatial.routes = [];
    expect(blockingCodes(missingReferences)).toEqual(expect.arrayContaining([
      "TERRAIN_INTENT_REGION_REFERENCE_NOT_FOUND",
      "TERRAIN_INTENT_ROUTE_REFERENCE_NOT_FOUND",
    ]));
  });

  it("does not turn preferred placement constraints into hard terrain edits", () => {
    const spec = focusedAuthoringSpec();
    spec.constraints.placements = spec.constraints.placements.map((constraint) =>
      constraint.id === "route-slope"
        ? {
            ...constraint,
            requirement: "preferred" as const,
            preferenceWeightRatio: 0.5,
          }
        : constraint,
    );

    const result = deriveTerrainConstraintsFromAuthoringV4(spec);
    expect(result.constraints.some((constraint) => constraint.kind === "route-slope")).toBe(false);
    expect(result.diagnostics).toEqual([]);
  });
});
