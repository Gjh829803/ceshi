import { describe, expect, it } from "vitest";

import {
  normalizeAuthoringSpecV4,
  parseAuthoringSpecV4,
  validateAuthoringSpecV4,
  type AuthoringSpecV4,
  type ConnectedByRouteConstraintV1,
  type ConnectivityConstraintSpecV1,
} from "./index.js";
import { createValidAuthoringSpec } from "./test-fixture.js";

const requiredRoute: ConnectedByRouteConstraintV1 = {
  id: "player-can-reach-watchtower",
  kind: "connected-by-route",
  requirement: "required",
  traversingEntityId: "player",
  startAnchorEntityId: "spawn-main",
  destinationAnchorEntityId: "watchtower-entry",
  routeId: "spawn-to-watchtower",
};

const groundStaticTraversalSurfaceBinding = {
  id: "deck",
  kind: "collider-subshape",
  logicalSubshapeId: "primary",
  traversalSurfaceProfileRef:
    "worldkit://traversal-surface-profile/ground.static@1",
} as const;

function validV4(): AuthoringSpecV4 {
  const source = createValidAuthoringSpec();
  return {
    ...source,
    spatial: {
      ...source.spatial,
      traversalAreas: [],
      routes: [
        {
          id: "spawn-to-watchtower",
          kind: "polyline-xz",
          pointsMetersXZ: [
            [0, 30],
            [12, -10],
          ],
          widthMeters: 3,
          locomotionProfileRef: "worldkit://locomotion-profile/humanoid.ground@1",
        },
      ],
    },
    nodes: [
      ...source.nodes,
      {
        id: "watchtower-entry",
        kind: "anchor",
        placement: {
          kind: "fixed",
          transform: { positionMetersXYZ: [12, 0, -10] },
        },
        semantic: { classId: "landmark.entry" },
      },
    ],
    constraints: {
      placements: source.constraints.placements,
      connectivity: [],
    },
  };
}

function withConnectivity(
  spec: AuthoringSpecV4,
  constraint: unknown,
): unknown {
  const copy = structuredClone(spec) as {
    constraints: { placements: unknown[]; connectivity?: unknown[] };
  };
  copy.constraints.connectivity = [constraint];
  return copy;
}

function withPrototypeTraversalSurfaceBindings(
  spec: AuthoringSpecV4,
  bindings: readonly unknown[],
  collisionEnabled = true,
): unknown {
  const copy = structuredClone(spec) as unknown as {
    resources: {
      prototypes: Array<{
        collisionEnabled: boolean;
        traversalSurfaceBindings?: readonly unknown[];
      }>;
    };
  };
  copy.resources.prototypes[0]!.collisionEnabled = collisionEnabled;
  copy.resources.prototypes[0]!.traversalSurfaceBindings = bindings;
  return copy;
}

function regularPolygonPoints(
  pointCount: number,
  centerXMeters = 0,
): readonly (readonly [number, number])[] {
  return Array.from({ length: pointCount }, (_, index) => {
    const angle = (index / pointCount) * Math.PI * 2;
    return [centerXMeters + Math.cos(angle), Math.sin(angle)] as const;
  });
}

function traversalArea(id: string, pointsMetersXZ: readonly (readonly [number, number])[]) {
  return {
    id,
    kind: "polygon-xz" as const,
    pointsMetersXZ,
    surfaceEntityId: "terrain-main",
    mode: "blocked" as const,
  };
}

describe("current Authoring entrypoints", () => {
  it("accepts V4 and rejects a superseded schema version through every unversioned API", () => {
    const v4 = validV4();
    const stale = { ...v4, schemaVersion: 3 };

    expect(parseAuthoringSpecV4(JSON.stringify(v4)).ok).toBe(true);
    expect(validateAuthoringSpecV4(v4).ok).toBe(true);
    expect(normalizeAuthoringSpecV4(v4)).toMatchObject({
      ok: true,
      value: {
        kind: "worldkit-normalized-world",
        schemaVersion: 4,
      },
    });

    expect(parseAuthoringSpecV4(JSON.stringify(stale))).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
          instancePath: "/schemaVersion",
        }),
      ]),
    });
  });
});

describe("Authoring Spec V4 Prototype traversal surface bindings", () => {
  it("admits the closed collider-subshape binding", () => {
    expect(validateAuthoringSpecV4(withPrototypeTraversalSurfaceBindings(
      validV4(),
      [groundStaticTraversalSurfaceBinding],
    )).ok).toBe(true);
  });

  it("rejects unknown binding fields and malformed Profile refs", () => {
    expect(validateAuthoringSpecV4(withPrototypeTraversalSurfaceBindings(
      validV4(),
      [{ ...groundStaticTraversalSurfaceBinding, providerArea: 7 }],
    ))).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "AUTHORING_SCHEMA_INVALID",
        instancePath:
          "/resources/prototypes/0/traversalSurfaceBindings/0/providerArea",
      })]),
    });

    expect(validateAuthoringSpecV4(withPrototypeTraversalSurfaceBindings(
      validV4(),
      [{
        ...groundStaticTraversalSurfaceBinding,
        traversalSurfaceProfileRef: "worldkit://profile/ground.static@1",
      }],
    ))).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "AUTHORING_SCHEMA_INVALID",
        instancePath:
          "/resources/prototypes/0/traversalSurfaceBindings/0/traversalSurfaceProfileRef",
      })]),
    });
  });

  it("rejects duplicate binding ids, unknown Subshapes, and disabled collision", () => {
    expect(validateAuthoringSpecV4(withPrototypeTraversalSurfaceBindings(
      validV4(),
      [
        groundStaticTraversalSurfaceBinding,
        { ...groundStaticTraversalSurfaceBinding },
      ],
    ))).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "AUTHORING_DUPLICATE_ID",
        instancePath:
          "/resources/prototypes/0/traversalSurfaceBindings/1/id",
      })]),
    });

    expect(validateAuthoringSpecV4(withPrototypeTraversalSurfaceBindings(
      validV4(),
      [
        groundStaticTraversalSurfaceBinding,
        { ...groundStaticTraversalSurfaceBinding, id: "upper-deck" },
      ],
    ))).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "AUTHORING_DUPLICATE_BINDING",
        instancePath:
          "/resources/prototypes/0/traversalSurfaceBindings/1/logicalSubshapeId",
      })]),
    });

    expect(validateAuthoringSpecV4(withPrototypeTraversalSurfaceBindings(
      validV4(),
      [{ ...groundStaticTraversalSurfaceBinding, logicalSubshapeId: "top" }],
    ))).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "AUTHORING_REFERENCE_NOT_FOUND",
        instancePath:
          "/resources/prototypes/0/traversalSurfaceBindings/0/logicalSubshapeId",
      })]),
    });

    expect(validateAuthoringSpecV4(withPrototypeTraversalSurfaceBindings(
      validV4(),
      [groundStaticTraversalSurfaceBinding],
      false,
    ))).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "AUTHORING_FEATURE_NOT_SUPPORTED",
        instancePath: "/resources/prototypes/0/traversalSurfaceBindings",
      })]),
    });
  });
});

describe("Authoring Spec V4 connectivity schema", () => {
  it("accepts production heightfields larger than the legacy 64 by 64 preview ceiling", () => {
    const source = validV4();
    const terrain = source.nodes.find((node) => node.kind === "terrain");
    expect(terrain?.kind).toBe("terrain");
    if (terrain?.kind !== "terrain") throw new Error("TEST_TERRAIN_MISSING");
    const heightSamplesMeters = Array.from({ length: 65 * 65 }, () => 0);
    const result = validateAuthoringSpecV4({
      ...source,
      nodes: source.nodes.map((node) => node.id === terrain.id
        ? {
            ...terrain,
            components: {
              terrain: {
                ...terrain.components.terrain,
                grid: {
                  ...terrain.components.terrain.grid,
                  resolutionCellsXZ: [65, 65],
                  heightSamplesMeters,
                },
              },
            },
          }
        : node),
    });

    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  });

  it("requires closed blocked traversal areas on a declared Terrain surface", () => {
    const valid = structuredClone(validV4()) as unknown as {
      spatial: { traversalAreas: unknown[] };
    };
    valid.spatial.traversalAreas = [{
      id: "dry-trench",
      kind: "polygon-xz",
      pointsMetersXZ: [[-1, -4], [1, -4], [1, 4], [-1, 4]],
      surfaceEntityId: "terrain-main",
      mode: "blocked",
    }];
    expect(validateAuthoringSpecV4(valid).ok).toBe(true);

    const missing = structuredClone(validV4()) as unknown as {
      spatial: { traversalAreas?: unknown[] };
    };
    delete missing.spatial.traversalAreas;
    expect(validateAuthoringSpecV4(missing).ok).toBe(false);

    expect(validateAuthoringSpecV4({
      ...valid,
      spatial: {
        ...valid.spatial,
        traversalAreas: [{
          ...(valid.spatial.traversalAreas[0] as object),
          mode: "jumpable",
        }],
      },
    }).ok).toBe(false);

    expect(validateAuthoringSpecV4({
      ...valid,
      spatial: {
        ...valid.spatial,
        traversalAreas: [{
          ...(valid.spatial.traversalAreas[0] as object),
          surfaceEntityId: "missing-terrain",
        }],
      },
    })).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "AUTHORING_REFERENCE_NOT_FOUND",
        instancePath: "/spatial/traversalAreas/0/surfaceEntityId",
      })]),
    });
  });

  it("requires each blocked traversal area to be a simple polygon", () => {
    const polygonCases = [
      {
        name: "self-intersection",
        pointsMetersXZ: [[0, 0], [3, 0], [0, 2], [2, 2]],
      },
      {
        name: "consecutive duplicate",
        pointsMetersXZ: [[0, 0], [2, 0], [2, 0], [0, 2]],
      },
      {
        name: "non-consecutive duplicate",
        pointsMetersXZ: [[0, 0], [2, 0], [2, 2], [0, 2], [2, 0]],
      },
      {
        name: "collinear overlap",
        pointsMetersXZ: [[0, 0], [3, 0], [1, 0], [1, 2], [0, 2]],
      },
    ] as const;
    for (const polygonCase of polygonCases) {
      const spec = structuredClone(validV4()) as unknown as {
        spatial: { traversalAreas: unknown[] };
      };
      spec.spatial.traversalAreas = [{
        id: `invalid-${polygonCase.name.replaceAll(" ", "-")}`,
        kind: "polygon-xz",
        pointsMetersXZ: polygonCase.pointsMetersXZ,
        surfaceEntityId: "terrain-main",
        mode: "blocked",
      }];
      expect(validateAuthoringSpecV4(spec), polygonCase.name).toMatchObject({
        ok: false,
        diagnostics: expect.arrayContaining([expect.objectContaining({
          code: "AUTHORING_SPATIAL_RANGE_INVALID",
          instancePath: "/spatial/traversalAreas/0/pointsMetersXZ",
        })]),
      });
    }

    const concave = structuredClone(validV4()) as unknown as {
      spatial: { traversalAreas: unknown[] };
    };
    concave.spatial.traversalAreas = [{
      id: "valid-concave-area",
      kind: "polygon-xz",
      pointsMetersXZ: [[0, 0], [3, 0], [3, 3], [1.5, 1], [0, 3]],
      surfaceEntityId: "terrain-main",
      mode: "blocked",
    }];
    expect(validateAuthoringSpecV4(concave).ok).toBe(true);
  });

  it("enforces frozen blocked traversal-area collection complexity limits", () => {
    const validateAreas = (traversalAreas: readonly unknown[]) => {
      const spec = structuredClone(validV4()) as unknown as {
        spatial: { traversalAreas: readonly unknown[] };
      };
      spec.spatial.traversalAreas = traversalAreas;
      return validateAuthoringSpecV4(spec);
    };
    const tooManyAreas = Array.from({ length: 65 }, (_, index) =>
      traversalArea(`area-${String(index).padStart(3, "0")}`, regularPolygonPoints(4)),
    );
    expect(validateAreas(tooManyAreas)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "AUTHORING_SPATIAL_BUDGET_EXCEEDED",
        instancePath: "/spatial/traversalAreas",
      })]),
    });
    expect(validateAreas([
      traversalArea("too-detailed", regularPolygonPoints(129)),
    ])).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "AUTHORING_SPATIAL_BUDGET_EXCEEDED",
        instancePath: "/spatial/traversalAreas/0/pointsMetersXZ",
      })]),
    });
    expect(validateAreas(Array.from({ length: 17 }, (_, index) =>
      traversalArea(
        `area-${String(index).padStart(3, "0")}`,
        regularPolygonPoints(128, index * 3),
      ),
    ))).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "AUTHORING_SPATIAL_BUDGET_EXCEEDED",
        instancePath: "/spatial/traversalAreas",
      })]),
    });
    expect(validateAreas(Array.from({ length: 16 }, (_, index) =>
      traversalArea(
        `area-${String(index).padStart(3, "0")}`,
        regularPolygonPoints(128, index * 3),
      ),
    )).ok).toBe(true);
  });

  it("accepts required connected-by-route and rejects unknown aliases", () => {
    expect(validateAuthoringSpecV4(withConnectivity(validV4(), requiredRoute)).ok).toBe(true);
    expect(validateAuthoringSpecV4(withConnectivity(validV4(), {
      ...requiredRoute,
      subjectId: "player",
    })).ok).toBe(false);
  });

  it("allows an empty connectivity collection and requires the collection itself", () => {
    expect(validateAuthoringSpecV4(validV4()).ok).toBe(true);

    const missingCollection = structuredClone(validV4()) as unknown as {
      constraints: { placements: unknown[] };
    };
    delete (missingCollection.constraints as { connectivity?: unknown }).connectivity;
    expect(validateAuthoringSpecV4(missingCollection).ok).toBe(false);
  });

  it("rejects preferred connectivity and any preferenceWeightRatio", () => {
    expect(
      validateAuthoringSpecV4(
        withConnectivity(validV4(), {
          ...requiredRoute,
          requirement: "preferred",
        }),
      ).ok,
    ).toBe(false);

    expect(
      validateAuthoringSpecV4(
        withConnectivity(validV4(), {
          ...requiredRoute,
          requirement: "preferred",
          preferenceWeightRatio: 0.5,
        }),
      ).ok,
    ).toBe(false);

    expect(
      validateAuthoringSpecV4(
        withConnectivity(validV4(), {
          ...requiredRoute,
          preferenceWeightRatio: 0.5,
        }),
      ).ok,
    ).toBe(false);
  });

  it("rejects generic subjectId/targetId/params in place of role-qualified IDs", () => {
    expect(
      validateAuthoringSpecV4(
        withConnectivity(validV4(), {
          id: "player-can-reach-watchtower",
          kind: "connected-by-route",
          requirement: "required",
          subjectId: "player",
          targetId: "watchtower-entry",
          params: { routeId: "spawn-to-watchtower" },
        }),
      ).ok,
    ).toBe(false);
  });

  it("rejects missing Subject, Anchor, and Route references", () => {
    expect(
      validateAuthoringSpecV4(
        withConnectivity(validV4(), {
          ...requiredRoute,
          traversingEntityId: "missing-player",
        }),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_REFERENCE_NOT_FOUND",
          instancePath: "/constraints/connectivity/0/traversingEntityId",
        }),
      ]),
    });

    expect(
      validateAuthoringSpecV4(
        withConnectivity(validV4(), {
          ...requiredRoute,
          startAnchorEntityId: "missing-spawn",
        }),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_REFERENCE_NOT_FOUND",
          instancePath: "/constraints/connectivity/0/startAnchorEntityId",
        }),
      ]),
    });

    expect(
      validateAuthoringSpecV4(
        withConnectivity(validV4(), {
          ...requiredRoute,
          destinationAnchorEntityId: "missing-watchtower",
        }),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_REFERENCE_NOT_FOUND",
          instancePath: "/constraints/connectivity/0/destinationAnchorEntityId",
        }),
      ]),
    });

    expect(
      validateAuthoringSpecV4(
        withConnectivity(validV4(), {
          ...requiredRoute,
          routeId: "missing-route",
        }),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_REFERENCE_NOT_FOUND",
          instancePath: "/constraints/connectivity/0/routeId",
        }),
      ]),
    });
  });

  it("rejects connectivity IDs that resolve to the wrong node kind", () => {
    expect(
      validateAuthoringSpecV4(
        withConnectivity(validV4(), {
          ...requiredRoute,
          traversingEntityId: "terrain-main",
        }),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_REFERENCE_KIND_MISMATCH",
          instancePath: "/constraints/connectivity/0/traversingEntityId",
        }),
      ]),
    });

    expect(
      validateAuthoringSpecV4(
        withConnectivity(validV4(), {
          ...requiredRoute,
          startAnchorEntityId: "player",
        }),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_REFERENCE_KIND_MISMATCH",
          instancePath: "/constraints/connectivity/0/startAnchorEntityId",
        }),
      ]),
    });
  });

  it("rejects connected-by-route inside constraints.placements", () => {
    const v4 = structuredClone(validV4()) as unknown as {
      constraints: { placements: unknown[]; connectivity: unknown[] };
    };
    v4.constraints.placements = [requiredRoute];
    expect(validateAuthoringSpecV4(v4).ok).toBe(false);
  });

  it("rejects unknown constraint fields and duplicate connectivity IDs", () => {
    expect(
      validateAuthoringSpecV4(
        withConnectivity(validV4(), {
          ...requiredRoute,
          capability: "walk",
        }),
      ).ok,
    ).toBe(false);

    const duplicate = structuredClone(
      withConnectivity(validV4(), requiredRoute),
    ) as {
      constraints: { connectivity: ConnectedByRouteConstraintV1[] };
    };
    duplicate.constraints.connectivity.push({
      ...requiredRoute,
      destinationAnchorEntityId: "spawn-main",
    });
    expect(validateAuthoringSpecV4(duplicate)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_DUPLICATE_ID",
          instancePath: "/constraints/connectivity/1/id",
        }),
      ]),
    });
  });

  it("parses canonical V4 JSON through both versioned and current parsers", () => {
    const v4 = withConnectivity(validV4(), requiredRoute);
    expect(parseAuthoringSpecV4(JSON.stringify(v4)).ok).toBe(true);
    expect(parseAuthoringSpecV4(JSON.stringify({ ...validV4(), schemaVersion: 3 }))).toEqual({
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
          instancePath: "/schemaVersion",
          message: "Authoring schema version '3' is not supported.",
          details: { supportedSchemaVersions: [4] },
        },
      ],
    });
    expect(parseAuthoringSpecV4(JSON.stringify(v4)).ok).toBe(true);
  });
});

const _connectivityTypeContract: readonly ConnectivityConstraintSpecV1[] = [
  requiredRoute,
];
void _connectivityTypeContract;
