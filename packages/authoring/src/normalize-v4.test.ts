import { describe, expect, it } from "vitest";

import {
  normalizeAuthoringSpecV3,
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
} from "./index.js";
import { createValidAuthoringSpec } from "./test-fixture.js";
import { sha256CanonicalJson } from "./canonical-json.js";

function routeWorld(): AuthoringSpecV4 {
  const source = createValidAuthoringSpec();
  return {
    ...source,
    schemaVersion: 4,
    spatial: {
      ...source.spatial,
      routes: [{
        id: "main-route",
        kind: "polyline-xz",
        pointsMetersXZ: [[0, 30], [12, -10]],
        widthMeters: 3,
        locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      }],
    },
    nodes: [
      ...source.nodes,
      {
        id: "goal",
        kind: "anchor",
        placement: {
          kind: "fixed",
          transform: { positionMetersXYZ: [12, 0, -10] },
        },
        semantic: { classId: "route.destination" },
      },
    ],
    constraints: {
      placements: source.constraints.placements,
      connectivity: [{
        id: "hero-to-goal",
        kind: "connected-by-route",
        requirement: "required",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn-main",
        destinationAnchorEntityId: "goal",
        routeId: "main-route",
      }],
    },
  };
}

describe("normalizeAuthoringSpecV4", () => {
  it("promotes connectivity into canonical IR and preserves solver provenance", () => {
    const result = normalizeAuthoringSpecV4(routeWorld());

    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      kind: "worldkit-normalized-world",
      schemaVersion: 4,
      layout: {
        connectivityRequirements: [{
          constraintId: "hero-to-goal",
          kind: "connected-by-route",
          traversingEntityId: "player",
          startAnchorEntityId: "spawn-main",
          destinationAnchorEntityId: "goal",
          routeId: "main-route",
        }],
        layoutSolveReportHash: result.layoutSolveReportHash,
      },
    });
    expect(result.value?.nodes.find((node) => node.id === "goal")).toMatchObject({
      placementProvenance: {
        kind: "fixed",
        solverProfileRef: "worldkit://layout-solver-profile/outdoor.s1@1",
        layoutSolveReportHash: result.layoutSolveReportHash,
      },
    });
    expect(result.normalizedWorldIrHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.normalizedWorldIrHash).toBe(sha256CanonicalJson(result.value));
    expect(result.normalizedWorldIrHash).not.toBe(result.layoutSolveReportHash);
  });

  it("canonicalizes connectivity ordering and hashes route changes", () => {
    const first = routeWorld();
    const zRoute: AuthoringSpecV4["constraints"]["connectivity"][number] = {
      id: "z-route",
      kind: "connected-by-route",
      requirement: "required",
      traversingEntityId: "player",
      startAnchorEntityId: "spawn-main",
      destinationAnchorEntityId: "goal",
      routeId: "main-route",
    };
    const reorderedSource = routeWorld();
    const reordered: AuthoringSpecV4 = {
      ...reorderedSource,
      constraints: {
        ...reorderedSource.constraints,
        connectivity: [
          zRoute,
          ...reorderedSource.constraints.connectivity,
        ].reverse(),
      },
    };
    const firstWithBoth: AuthoringSpecV4 = {
      ...first,
      constraints: {
        ...first.constraints,
        connectivity: [
          ...first.constraints.connectivity,
          zRoute,
        ],
      },
    };

    const firstResult = normalizeAuthoringSpecV4(firstWithBoth);
    const reorderedResult = normalizeAuthoringSpecV4(reordered);
    expect(firstResult.normalizedWorldIrHash).toBe(reorderedResult.normalizedWorldIrHash);
    expect(firstResult.value?.layout.connectivityRequirements.map((row) => row.constraintId))
      .toEqual(["hero-to-goal", "z-route"]);

    const changedSource = routeWorld();
    const changed: AuthoringSpecV4 = {
      ...changedSource,
      spatial: {
        ...changedSource.spatial,
        routes: [{
          ...changedSource.spatial.routes[0]!,
          widthMeters: 4,
        }],
      },
    };
    expect(normalizeAuthoringSpecV4(changed).normalizedWorldIrHash)
      .not.toBe(normalizeAuthoringSpecV4(routeWorld()).normalizedWorldIrHash);

    const connectivitySource = routeWorld();
    const changedConnectivity: AuthoringSpecV4 = {
      ...connectivitySource,
      constraints: {
        ...connectivitySource.constraints,
        connectivity: [{
          ...connectivitySource.constraints.connectivity[0]!,
          id: "hero-to-goal-v2",
        }],
      },
    };
    expect(normalizeAuthoringSpecV4(changedConnectivity).normalizedWorldIrHash)
      .not.toBe(normalizeAuthoringSpecV4(routeWorld()).normalizedWorldIrHash);
  });

  it("does not let the explicit V3 normalizer reinterpret V4", () => {
    expect(normalizeAuthoringSpecV3(routeWorld())).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_SCHEMA_INVALID",
          instancePath: "/schemaVersion",
        }),
      ]),
    });
  });
});
