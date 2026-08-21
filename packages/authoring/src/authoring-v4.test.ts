import { describe, expect, it } from "vitest";

import {
  parseAuthoringSpecJson,
  parseAuthoringSpecV3Json,
  parseAuthoringSpecV4,
  validateAuthoringSpecV3,
  validateAuthoringSpecV4,
  type AuthoringSpecV3,
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

function validV3(): AuthoringSpecV3 {
  return structuredClone(createValidAuthoringSpec());
}

function validV4(): AuthoringSpecV4 {
  const source = validV3();
  return {
    ...source,
    schemaVersion: 4,
    spatial: {
      ...source.spatial,
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
  spec: AuthoringSpecV3 | AuthoringSpecV4,
  constraint: unknown,
): unknown {
  const copy = structuredClone(spec) as {
    constraints: { placements: unknown[]; connectivity?: unknown[] };
  };
  copy.constraints.connectivity = [constraint];
  return copy;
}

describe("Authoring Spec V4 connectivity schema", () => {
  it("accepts required connected-by-route in V4 and rejects it from V3", () => {
    expect(validateAuthoringSpecV4(withConnectivity(validV4(), requiredRoute)).ok).toBe(true);
    expect(validateAuthoringSpecV3(withConnectivity(validV3(), requiredRoute)).ok).toBe(false);
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

  it("rejects connected-by-route inside constraints.placements for V3 and V4", () => {
    const v4 = structuredClone(validV4()) as unknown as {
      constraints: { placements: unknown[]; connectivity: unknown[] };
    };
    v4.constraints.placements = [requiredRoute];
    expect(validateAuthoringSpecV4(v4).ok).toBe(false);

    const v3 = structuredClone(validV3()) as unknown as {
      constraints: { placements: unknown[] };
    };
    v3.constraints.placements = [requiredRoute];
    expect(validateAuthoringSpecV3(v3).ok).toBe(false);
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

  it("parses only canonical V4 JSON and leaves the default parser on V3", () => {
    const v4 = withConnectivity(validV4(), requiredRoute);
    expect(parseAuthoringSpecV4(JSON.stringify(v4)).ok).toBe(true);
    expect(parseAuthoringSpecV4(JSON.stringify(validV3()))).toEqual({
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
    expect(parseAuthoringSpecV3Json(JSON.stringify(v4))).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
          details: { supportedSchemaVersions: [3] },
        }),
      ],
    });
    expect(parseAuthoringSpecJson(JSON.stringify(v4))).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
          details: { supportedSchemaVersions: [3] },
        }),
      ],
    });
  });
});

const _connectivityTypeContract: readonly ConnectivityConstraintSpecV1[] = [
  requiredRoute,
];
void _connectivityTypeContract;
