import { describe, expect, it } from "vitest";

import {
  resolveAuthoringLayoutV4,
  type AuthoringSpecV4,
  type PlacementConstraintSpecV1,
} from "./index.js";
import { createValidAuthoringSpec } from "./test-fixture.js";

function solvedSpawnWorld(): AuthoringSpecV4 {
  const base = createValidAuthoringSpec();
  return {
    ...base,
    spatial: {
      regions: [{
        id: "spawn-zone",
        kind: "polygon-xz",
        pointsMetersXZ: [[-4, -4], [4, -4], [4, 4], [-4, 4]],
        semanticClassId: "terrain.spawn-zone",
      }],
      routes: [],
      screenRegions: [],
      traversalAreas: [],
    },
    nodes: base.nodes.map((node) =>
      node.id === "spawn-main" && node.kind === "anchor"
        ? {
            ...node,
            placement: {
              kind: "solved" as const,
              placementConstraintIds: ["spawn-inside", "spawn-supported"],
            },
          }
        : node
    ),
    constraints: {
      placements: [
        {
          id: "spawn-inside",
          kind: "inside-region",
          requirement: "required",
          entityId: "spawn-main",
          regionId: "spawn-zone",
          boundaryClearanceMeters: 0,
        },
        {
          id: "spawn-supported",
          kind: "supported-by",
          requirement: "required",
          supportedEntityId: "spawn-main",
          supportingEntityId: "terrain-main",
          maximumSupportGapMeters: 0,
          minimumSupportRatio: 1,
        },
      ],
      connectivity: [],
    },
  };
}

describe("Authoring V4 resolved layout input", () => {
  it("copies production-scale locked heightfields without spreading them as call arguments", () => {
    const source = solvedSpawnWorld();
    const resolutionCellsXZ = [400, 400] as const;
    const heightSamplesMeters = Array.from(
      { length: resolutionCellsXZ[0] * resolutionCellsXZ[1] },
      (_value, index) => index % 17 / 10,
    );
    const result = resolveAuthoringLayoutV4({
      ...source,
      nodes: source.nodes.map((node) => node.kind === "terrain"
        ? {
            ...node,
            components: {
              terrain: {
                ...node.components.terrain,
                grid: {
                  ...node.components.terrain.grid,
                  resolutionCellsXZ,
                  heightSamplesMeters,
                },
              },
            },
          }
        : node),
    });

    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.value?.geometry.heightfieldsByTerrainEntityId["terrain-main"]
      ?.heightSamplesMeters).toHaveLength(heightSamplesMeters.length);
  });

  it("projects locked bounds, terrain, spatial rows, constraints, and a solved-anchor camera rig", () => {
    const result = resolveAuthoringLayoutV4(solvedSpawnWorld());

    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      kind: "worldkit-resolved-layout-input",
      schemaVersion: 1,
      solverProfile: {
        solverProfileRef: "worldkit://layout-solver-profile/outdoor.s1@1",
        resolvedVersion: "1",
        contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      entities: expect.arrayContaining([
        expect.objectContaining({
          id: "wall-east",
          halfExtentsMetersXYZ: [1, 2, 7],
          placement: expect.objectContaining({ kind: "fixed" }),
        }),
        expect.objectContaining({
          id: "spawn-main",
          halfExtentsMetersXYZ: [0, 0, 0],
          placement: { kind: "solved", placementConstraintIds: ["spawn-inside", "spawn-supported"] },
          candidateRegionIds: ["spawn-zone"],
          supportingTerrainEntityId: "terrain-main",
        }),
      ]),
      geometry: {
        heightfieldsByTerrainEntityId: {
          "terrain-main": expect.objectContaining({
            resolutionVerticesXZ: [65, 65],
            heightSamplesMeters: expect.any(Array),
          }),
        },
        staticBoundsByEntityId: {},
        camerasByEntityId: {
          "camera-main": expect.objectContaining({
            kind: "third-person",
            targetAnchorEntityId: "spawn-main",
            aspectRatio: 16 / 9,
          }),
        },
      },
    });
    expect(result.value?.geometry.heightfieldsByTerrainEntityId["terrain-main"]?.heightSamplesMeters)
      .toHaveLength(65 * 65);
  });

  it("reports missing Profile, Region, and placement Constraint refs at canonical paths", () => {
    const missingProfile = {
      ...solvedSpawnWorld(),
      layout: { solverProfileRef: "worldkit://layout-solver-profile/missing@1" },
    };
    expect(resolveAuthoringLayoutV4(missingProfile)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_LAYOUT_PROFILE_NOT_FOUND",
          instancePath: "/layout/solverProfileRef",
        }),
      ]),
    });

    const missingRegion = solvedSpawnWorld();
    const invalidRegion = {
      ...missingRegion,
      constraints: {
        ...missingRegion.constraints,
        placements: missingRegion.constraints.placements.map((constraint) =>
          constraint.id === "spawn-inside"
            ? { ...constraint, regionId: "missing-zone" }
            : constraint
        ),
      },
    } as AuthoringSpecV4;
    expect(resolveAuthoringLayoutV4(invalidRegion)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_REFERENCE_NOT_FOUND",
          instancePath: "/constraints/placements/0/regionId",
        }),
      ]),
    });

    const missingConstraint = solvedSpawnWorld();
    const invalidConstraint = {
      ...missingConstraint,
      nodes: missingConstraint.nodes.map((node) =>
        node.id === "spawn-main" && node.kind === "anchor"
          ? { ...node, placement: { kind: "solved" as const, placementConstraintIds: ["missing"] } }
          : node
      ),
    };
    expect(resolveAuthoringLayoutV4(invalidConstraint)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_REFERENCE_NOT_FOUND",
          instancePath: "/nodes/3/placement/placementConstraintIds/0",
        }),
      ]),
    });
  });

  it.each<{
    kind: PlacementConstraintSpecV1["kind"];
    constraint: PlacementConstraintSpecV1;
    instancePath: string;
  }>([
    {
      kind: "inside-region",
      constraint: {
        id: "constraint-under-test",
        kind: "inside-region",
        requirement: "required",
        entityId: "wall-east",
        regionId: "missing-region",
        boundaryClearanceMeters: 0,
      },
      instancePath: "/constraints/placements/0/regionId",
    },
    {
      kind: "outside-region",
      constraint: {
        id: "constraint-under-test",
        kind: "outside-region",
        requirement: "required",
        entityId: "wall-east",
        regionId: "missing-region",
        boundaryClearanceMeters: 0,
      },
      instancePath: "/constraints/placements/0/regionId",
    },
    {
      kind: "distance-range",
      constraint: {
        id: "constraint-under-test",
        kind: "distance-range",
        requirement: "required",
        entityId: "wall-east",
        referenceEntityId: "missing-entity",
        minimumDistanceMeters: 1,
        maximumDistanceMeters: 2,
      },
      instancePath: "/constraints/placements/0/referenceEntityId",
    },
    {
      kind: "faces-entity",
      constraint: {
        id: "constraint-under-test",
        kind: "faces-entity",
        requirement: "required",
        facingEntityId: "wall-east",
        targetEntityId: "missing-entity",
        maximumAngularDeviationDegrees: 15,
      },
      instancePath: "/constraints/placements/0/targetEntityId",
    },
    {
      kind: "supported-by",
      constraint: {
        id: "constraint-under-test",
        kind: "supported-by",
        requirement: "required",
        supportedEntityId: "wall-east",
        supportingEntityId: "missing-entity",
        maximumSupportGapMeters: 0,
        minimumSupportRatio: 1,
      },
      instancePath: "/constraints/placements/0/supportingEntityId",
    },
    {
      kind: "minimum-clearance",
      constraint: {
        id: "constraint-under-test",
        kind: "minimum-clearance",
        requirement: "required",
        entityId: "wall-east",
        clearanceMeters: 1,
        otherEntityIds: ["missing-entity"],
      },
      instancePath: "/constraints/placements/0/otherEntityIds/0",
    },
    {
      kind: "within-slope-limit",
      constraint: {
        id: "constraint-under-test",
        kind: "within-slope-limit",
        requirement: "required",
        terrainEntityId: "terrain-main",
        routeId: "missing-route",
        maximumSlopeDegrees: 12,
      },
      instancePath: "/constraints/placements/0/routeId",
    },
    {
      kind: "visible-in-camera-region",
      constraint: {
        id: "constraint-under-test",
        kind: "visible-in-camera-region",
        requirement: "required",
        visibleEntityId: "wall-east",
        cameraEntityId: "camera-main",
        screenRegionId: "missing-screen-region",
        minimumVisibleRatio: 0.5,
        minimumProjectedAreaRatio: 0.01,
      },
      instancePath: "/constraints/placements/0/screenRegionId",
    },
  ])("validates $kind semantic references", ({ constraint, instancePath }) => {
    const spec = createValidAuthoringSpec();
    spec.constraints.placements = [constraint];

    expect(resolveAuthoringLayoutV4(spec)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_REFERENCE_NOT_FOUND",
          instancePath,
        }),
      ]),
    });
  });
});
