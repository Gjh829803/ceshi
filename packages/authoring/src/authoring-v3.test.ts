import { describe, expect, it } from "vitest";

import basicWorldV3 from "../../../examples/authoring/basic-world.json";

import {
  parseAuthoringSpecV3Json,
  validateAuthoringSpecV3,
  type AuthoringSpecV3,
  type PlacementConstraintSpecV1,
} from "./index.js";

function validV3(): AuthoringSpecV3 {
  const current = structuredClone(basicWorldV3);
  const { traversalAreas: _traversalAreas, ...spatial } = current.spatial;
  const { connectivity: _connectivity, ...constraints } = current.constraints;
  const source = {
    ...current,
    schemaVersion: 3,
    spatial,
    constraints,
  } as unknown as AuthoringSpecV3;
  const nodes = source.nodes.map((node) => {
    if (node.id === "tower") {
      if (node.kind !== "object") throw new Error("Tower fixture must be an Object.");
      return {
        ...node,
        placement: {
          kind: "solved" as const,
          initialTransform: node.placement.kind === "fixed"
            ? node.placement.transform
            : node.placement.initialTransform,
          placementConstraintIds: [
            "tower-inside-east-bluff",
            "tower-outside-water",
            "tower-distance-wall",
            "tower-faces-wall",
            "tower-supported",
            "tower-clearance",
            "tower-slope",
            "tower-visible",
          ],
        },
      };
    }
    return node;
  });

  return {
    ...source,
    schemaVersion: 3,
    layout: {
      solverProfileRef: "worldkit://layout-solver-profile/outdoor.s1@1",
    },
    spatial: {
      regions: [
        {
          id: "east-bluff",
          kind: "polygon-xz",
          pointsMetersXZ: [[10, -30], [30, -30], [30, -10], [10, -10]],
          minimumHeightMeters: 0,
          maximumHeightMeters: 12,
          semanticClassId: "terrain.bluff",
        },
        {
          id: "water-region",
          kind: "polygon-xz",
          pointsMetersXZ: [[-8, -20], [8, -20], [8, -5], [-8, -5]],
          semanticClassId: "water.sea",
        },
      ],
      routes: [
        {
          id: "main-path",
          kind: "polyline-xz",
          pointsMetersXZ: [[0, 30], [8, 10], [17, -19]],
          widthMeters: 3,
          locomotionProfileRef: "worldkit://locomotion-profile/humanoid.ground@1",
        },
      ],
      screenRegions: [
        {
          id: "upper-right",
          kind: "rectangle-uv",
          minimumUv: [0.5, 0],
          maximumUv: [1, 0.5],
        },
      ],
    },
    constraints: {
      placements: [
        {
          id: "tower-inside-east-bluff",
          kind: "inside-region",
          requirement: "required",
          entityId: "tower",
          regionId: "east-bluff",
          boundaryClearanceMeters: 1,
        },
        {
          id: "tower-outside-water",
          kind: "outside-region",
          requirement: "required",
          entityId: "tower",
          regionId: "water-region",
          boundaryClearanceMeters: 2,
        },
        {
          id: "tower-distance-wall",
          kind: "distance-range",
          requirement: "preferred",
          preferenceWeightRatio: 0.6,
          entityId: "tower",
          referenceEntityId: "wall-east",
          minimumDistanceMeters: 8,
          maximumDistanceMeters: 40,
        },
        {
          id: "tower-faces-wall",
          kind: "faces-entity",
          requirement: "preferred",
          preferenceWeightRatio: 0.4,
          facingEntityId: "tower",
          targetEntityId: "wall-east",
          maximumAngularDeviationDegrees: 10,
        },
        {
          id: "tower-supported",
          kind: "supported-by",
          requirement: "required",
          supportedEntityId: "tower",
          supportingEntityId: "terrain-main",
          maximumSupportGapMeters: 0.05,
          minimumSupportRatio: 0.9,
        },
        {
          id: "tower-clearance",
          kind: "minimum-clearance",
          requirement: "required",
          entityId: "tower",
          otherEntityIds: ["wall-east", "wall-west"],
          clearanceMeters: 0,
        },
        {
          id: "tower-slope",
          kind: "within-slope-limit",
          requirement: "required",
          entityId: "tower",
          terrainEntityId: "terrain-main",
          maximumSlopeDegrees: 35,
        },
        {
          id: "tower-visible",
          kind: "visible-in-camera-region",
          requirement: "preferred",
          preferenceWeightRatio: 0.8,
          visibleEntityId: "tower",
          cameraEntityId: "camera-main",
          screenRegionId: "upper-right",
          minimumVisibleRatio: 0.65,
          minimumProjectedAreaRatio: 0.01,
        },
      ],
    },
    nodes,
  } as unknown as AuthoringSpecV3;
}

function replaceConstraint(
  spec: AuthoringSpecV3,
  index: number,
  constraint: unknown,
): unknown {
  const copy = structuredClone(spec) as unknown as {
    constraints: { placements: unknown[] };
  };
  copy.constraints.placements[index] = constraint;
  return copy;
}

describe("Authoring Spec V3 placement schema", () => {
  it("accepts the exact eight placement constraint unions", () => {
    const spec = validV3();
    const result = validateAuthoringSpecV3(spec);

    expect(result).toEqual({ ok: true, value: spec, diagnostics: [] });
    expect(spec.constraints.placements.map((constraint) => constraint.kind)).toEqual([
      "inside-region",
      "outside-region",
      "distance-range",
      "faces-entity",
      "supported-by",
      "minimum-clearance",
      "within-slope-limit",
      "visible-in-camera-region",
    ]);
  });

  it("rejects unsupported constraint kinds at the discriminator path", () => {
    const spec = validV3();
    const invalid = replaceConstraint(spec, 0, {
      ...spec.constraints.placements[0],
      kind: "relative-direction",
    });

    expect(validateAuthoringSpecV3(invalid)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ instancePath: "/constraints/placements/0/kind" }),
      ]),
    });
  });

  it("enforces fixed and solved placement as an exclusive closed union", () => {
    const spec = validV3();
    const objectIndex = spec.nodes.findIndex((node) => node.id === "tower");
    const both = structuredClone(spec) as unknown as {
      nodes: Array<Record<string, unknown>>;
    };
    both.nodes[objectIndex] = {
      ...both.nodes[objectIndex],
      transform: { positionMetersXYZ: [1, 2, 3] },
    };
    expect(validateAuthoringSpecV3(both)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ instancePath: `/nodes/${objectIndex}/transform` }),
      ]),
    });

    const missingPlacement = structuredClone(spec) as unknown as {
      nodes: Array<Record<string, unknown>>;
    };
    delete missingPlacement.nodes[objectIndex]?.placement;
    expect(validateAuthoringSpecV3(missingPlacement)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ instancePath: `/nodes/${objectIndex}/placement` }),
      ]),
    });
  });

  it("enforces preferred weights and required constraints without weights", () => {
    const spec = validV3();
    const requiredWithWeight = {
      ...spec.constraints.placements[0],
      preferenceWeightRatio: 0.5,
    };
    expect(validateAuthoringSpecV3(replaceConstraint(spec, 0, requiredWithWeight)).ok).toBe(
      false,
    );

    const preferredWithoutWeight = structuredClone(
      spec.constraints.placements[2],
    ) as Record<string, unknown>;
    delete preferredWithoutWeight.preferenceWeightRatio;
    expect(
      validateAuthoringSpecV3(replaceConstraint(spec, 2, preferredWithoutWeight)),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          instancePath: "/constraints/placements/2/preferenceWeightRatio",
        }),
      ]),
    });
  });

  it("rejects ambiguous endpoint unions, duplicate IDs, and invalid ordered ranges", () => {
    const spec = validV3();
    const ambiguousClearance = {
      ...spec.constraints.placements[5],
      semanticClassIds: ["obstacle.wall"],
    };
    expect(validateAuthoringSpecV3(replaceConstraint(spec, 5, ambiguousClearance)).ok).toBe(
      false,
    );

    const duplicate = structuredClone(spec) as unknown as {
      spatial: { regions: Array<AuthoringSpecV3["spatial"]["regions"][number]> };
    };
    duplicate.spatial.regions[1] = {
      ...duplicate.spatial.regions[1]!,
      id: "east-bluff",
    };
    expect(validateAuthoringSpecV3(duplicate)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_DUPLICATE_ID",
          instancePath: "/spatial/regions/1/id",
        }),
      ]),
    });

    const invalidUv = structuredClone(spec) as unknown as {
      spatial: {
        screenRegions: Array<AuthoringSpecV3["spatial"]["screenRegions"][number]>;
      };
    };
    invalidUv.spatial.screenRegions[0] = {
      ...invalidUv.spatial.screenRegions[0]!,
      minimumUv: [0.8, 0.6],
      maximumUv: [0.2, 0.4],
    };
    expect(validateAuthoringSpecV3(invalidUv)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "AUTHORING_SPATIAL_RANGE_INVALID" }),
      ]),
    });

    const invalidDistance = replaceConstraint(spec, 2, {
      ...spec.constraints.placements[2],
      minimumDistanceMeters: 20,
      maximumDistanceMeters: 10,
    });
    expect(validateAuthoringSpecV3(invalidDistance)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "AUTHORING_SPATIAL_RANGE_INVALID" }),
      ]),
    });
  });

  it("rejects non-finite numbers, invalid polygon cardinality, and unknown fields", () => {
    const spec = validV3();
    const shortPolygon = structuredClone(spec) as unknown as {
      spatial: { regions: Array<AuthoringSpecV3["spatial"]["regions"][number]> };
    };
    shortPolygon.spatial.regions[0] = {
      ...shortPolygon.spatial.regions[0]!,
      pointsMetersXZ: [[0, 0], [1, 1]],
    };
    expect(validateAuthoringSpecV3(shortPolygon).ok).toBe(false);

    const nonFinite = structuredClone(spec) as unknown as {
      spatial: { routes: Array<AuthoringSpecV3["spatial"]["routes"][number]> };
    };
    nonFinite.spatial.routes[0] = {
      ...nonFinite.spatial.routes[0]!,
      widthMeters: Number.POSITIVE_INFINITY,
    };
    expect(validateAuthoringSpecV3(nonFinite).ok).toBe(false);

    const unknown = structuredClone(spec) as unknown as Record<string, unknown>;
    unknown.solver = {};
    expect(validateAuthoringSpecV3(unknown)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ instancePath: "/solver" }),
      ]),
    });
  });

  it("parses only canonical V3 JSON and reports the supported version", () => {
    expect(parseAuthoringSpecV3Json(JSON.stringify(validV3())).ok).toBe(true);
    expect(
      parseAuthoringSpecV3Json(JSON.stringify({ ...validV3(), schemaVersion: 2 })),
    ).toEqual({
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
          instancePath: "/schemaVersion",
          message: "Authoring schema version '2' is not supported.",
          details: { supportedSchemaVersions: [3] },
        },
      ],
    });
  });

  it("requires a locked camera aspect ratio for deterministic screen projection", () => {
    const spec = validV3();
    const cameraIndex = spec.nodes.findIndex((node) => node.kind === "camera");
    const invalid = structuredClone(spec) as unknown as {
      nodes: Array<{ components?: { cameraRig?: { thirdPerson?: Record<string, unknown> } } }>;
    };
    delete invalid.nodes[cameraIndex]?.components?.cameraRig?.thirdPerson?.aspectRatio;
    expect(validateAuthoringSpecV3(invalid)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          instancePath: `/nodes/${cameraIndex}/components/cameraRig/thirdPerson/aspectRatio`,
        }),
      ]),
    });
  });
});

const _constraintTypeContract: readonly PlacementConstraintSpecV1[] =
  validV3().constraints.placements;
void _constraintTypeContract;
