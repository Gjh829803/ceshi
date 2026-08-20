import { describe, expect, it } from "vitest";

import {
  resolveAuthoringLayoutV3,
  type AuthoringSpecV3,
} from "./index.js";
import { createValidAuthoringSpec } from "./test-fixture.js";

function solvedSpawnWorld(): AuthoringSpecV3 {
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
    },
  };
}

describe("Authoring V3 resolved layout input", () => {
  it("projects locked bounds, terrain, spatial rows, constraints, and a solved-anchor camera rig", () => {
    const result = resolveAuthoringLayoutV3(solvedSpawnWorld());

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
    expect(resolveAuthoringLayoutV3(missingProfile)).toMatchObject({
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
        placements: missingRegion.constraints.placements.map((constraint) =>
          constraint.id === "spawn-inside"
            ? { ...constraint, regionId: "missing-zone" }
            : constraint
        ),
      },
    } as AuthoringSpecV3;
    expect(resolveAuthoringLayoutV3(invalidRegion)).toMatchObject({
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
    expect(resolveAuthoringLayoutV3(invalidConstraint)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_REFERENCE_NOT_FOUND",
          instancePath: "/nodes/3/placement/placementConstraintIds/0",
        }),
      ]),
    });
  });
});
