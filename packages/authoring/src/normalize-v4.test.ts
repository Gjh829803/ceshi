import { describe, expect, it } from "vitest";

import {
  canonicalAuthoringLayoutIdentityV4,
  normalizeAuthoringSpecV3,
  normalizeAuthoringSpecV4,
  projectNormalizedWorldResourcesToLayoutIdentityV4,
  type AuthoringSpecV4,
} from "./index.js";
import {
  createValidAuthoringSpecV4 as createValidAuthoringSpec,
} from "./test-fixture.js";
import { sha256CanonicalJson } from "./canonical-json.js";

const GROUND_STATIC_PROFILE_REF =
  "worldkit://traversal-surface-profile/ground.static@1";
const GROUND_STATIC_PROFILE_HASH =
  "sha256:16d21f75625a849156be42b27c11cea30f461292f346ce8aae52f6049f0aa4d4";

function routeWorld(): AuthoringSpecV4 {
  const source = createValidAuthoringSpec();
  return {
    ...source,
    schemaVersion: 4,
    spatial: {
      ...source.spatial,
      traversalAreas: [{
        id: "dry-trench",
        kind: "polygon-xz",
        pointsMetersXZ: [[-2, 1], [2, 1], [2, -1], [-2, -1]],
        surfaceEntityId: "terrain-main",
        mode: "blocked",
      }],
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

function routeWorldWithBindings(
  bindings: readonly {
    readonly id: string;
    readonly kind: "collider-subshape";
    readonly logicalSubshapeId: string;
    readonly traversalSurfaceProfileRef: string;
  }[] = [{
    id: "deck",
    kind: "collider-subshape",
    logicalSubshapeId: "primary",
    traversalSurfaceProfileRef: GROUND_STATIC_PROFILE_REF,
  }],
): AuthoringSpecV4 {
  const source = structuredClone(routeWorld()) as unknown as {
    resources: {
      prototypes: Array<{
        traversalSurfaceBindings?: typeof bindings;
      }>;
    };
  };
  source.resources.prototypes[0]!.traversalSurfaceBindings = bindings;
  return source as unknown as AuthoringSpecV4;
}

function routeWorldWithReorderableBoundPrototypes(reverse: boolean): AuthoringSpecV4 {
  const source = routeWorldWithBindings();
  const prototype = source.resources.prototypes[0]!;
  const prototypes: AuthoringSpecV4["resources"]["prototypes"] = [
    prototype,
    {
      id: "platform-alt",
      version: 1,
      kind: "primitive",
      primitive: "box",
      sizeMetersXYZ: [4, 0.5, 4],
      collisionEnabled: true,
      traversalSurfaceBindings: [{
        id: "upper-deck",
        kind: "collider-subshape",
        logicalSubshapeId: "primary",
        traversalSurfaceProfileRef: GROUND_STATIC_PROFILE_REF,
      }],
    },
  ];
  return {
    ...source,
    resources: {
      ...source.resources,
      prototypes: reverse ? [...prototypes].reverse() : prototypes,
    },
  };
}

describe("normalizeAuthoringSpecV4", () => {
  it("sorts and recursively freezes V4-only Prototype bindings", () => {
    const first = normalizeAuthoringSpecV4(
      routeWorldWithReorderableBoundPrototypes(false),
    );
    const reversed = normalizeAuthoringSpecV4(
      routeWorldWithReorderableBoundPrototypes(true),
    );
    const normalizedPrototypes = first.value?.resources.prototypes;

    expect(first.ok).toBe(true);
    expect(normalizedPrototypes?.map((prototype) => prototype.id)).toEqual([
      "platform-alt",
      "wall",
    ]);
    for (const prototype of normalizedPrototypes ?? []) {
      expect(Object.isFrozen(prototype.traversalSurfaceBindings)).toBe(true);
      expect(Object.isFrozen(prototype.traversalSurfaceBindings?.[0])).toBe(true);
    }
    expect(first.normalizedWorldIrHash).toBe(reversed.normalizedWorldIrHash);
    expect(first.value?.authoringSpecHash).toBe(reversed.value?.authoringSpecHash);
  });

  it("locks each distinct resolved Profile receipt with exact canonical bytes", () => {
    const result = normalizeAuthoringSpecV4(routeWorldWithBindings());

    expect(result.ok).toBe(true);
    expect(result.value?.resources.resourceLock).toContainEqual({
      resourceRef: GROUND_STATIC_PROFILE_REF,
      resourceKind: "traversal-surface-profile",
      resolvedVersion: "1",
      contentHash: GROUND_STATIC_PROFILE_HASH,
    });
    expect(result.value?.resources.resourceLock.filter(
      (entry) => entry.resourceRef === GROUND_STATIC_PROFILE_REF,
    )).toHaveLength(1);
  });

  it("binds Prototype and resolved Profile changes into every V4 identity layer", () => {
    const unbound = normalizeAuthoringSpecV4(routeWorld());
    const bound = normalizeAuthoringSpecV4(routeWorldWithBindings());
    const renamed = normalizeAuthoringSpecV4(routeWorldWithBindings([{
      id: "deck-renamed",
      kind: "collider-subshape",
      logicalSubshapeId: "primary",
      traversalSurfaceProfileRef: GROUND_STATIC_PROFILE_REF,
    }]));

    expect(bound.value?.authoringSpecHash).not.toBe(unbound.value?.authoringSpecHash);
    expect(bound.normalizedWorldIrHash).not.toBe(unbound.normalizedWorldIrHash);
    expect(bound.value?.resources.resourceLockHash)
      .not.toBe(unbound.value?.resources.resourceLockHash);
    expect(renamed.value?.authoringSpecHash).not.toBe(bound.value?.authoringSpecHash);
    expect(renamed.normalizedWorldIrHash).not.toBe(bound.normalizedWorldIrHash);
    expect(renamed.value?.resources.resourceLockHash)
      .toBe(bound.value?.resources.resourceLockHash);
  });

  it("fails closed when a syntactically valid Profile ref cannot be resolved", () => {
    const result = normalizeAuthoringSpecV4(routeWorldWithBindings([{
      id: "deck",
      kind: "collider-subshape",
      logicalSubshapeId: "primary",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@2",
    }]));

    expect(result).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "AUTHORING_REFERENCE_NOT_FOUND",
        instancePath:
          "/resources/prototypes/0/traversalSurfaceBindings/0/traversalSurfaceProfileRef",
      })]),
    });
  });

  it("promotes connectivity into canonical IR and preserves solver provenance", () => {
    const result = normalizeAuthoringSpecV4(routeWorld());

    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      kind: "worldkit-normalized-world",
      schemaVersion: 4,
      authoringSpecHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      layout: {
        traversalAreas: [{
          id: "dry-trench",
          kind: "polygon-xz",
          pointsMetersXZ: [[-2, 1], [2, 1], [2, -1], [-2, -1]],
          surfaceEntityId: "terrain-main",
          mode: "blocked",
        }],
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

  it("hashes the complete V4 Authoring identity without aliasing the V3 layout identity", () => {
    const baseline = normalizeAuthoringSpecV4(routeWorld());
    const repeated = normalizeAuthoringSpecV4(routeWorld());
    const changedSource = routeWorld();
    const changedConnectivity = normalizeAuthoringSpecV4({
      ...changedSource,
      constraints: {
        ...changedSource.constraints,
        connectivity: changedSource.constraints.connectivity.map((row) => ({
          ...row,
          id: `${row.id}-changed`,
        })),
      },
    });

    expect(baseline.value?.authoringSpecHash).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(repeated.value?.authoringSpecHash).toBe(
      baseline.value?.authoringSpecHash,
    );
    expect(changedConnectivity.value?.authoringSpecHash).not.toBe(
      baseline.value?.authoringSpecHash,
    );
    expect(changedConnectivity.layoutSolveReport?.authoringSpecHash).toBe(
      baseline.layoutSolveReport?.authoringSpecHash,
    );
    expect(baseline.value?.authoringSpecHash).not.toBe(
      baseline.normalizedWorldIrHash,
    );
    expect(baseline.value?.authoringSpecHash).not.toBe(
      baseline.layoutSolveReport?.authoringSpecHash,
    );
  });

  it("reconstructs the self-contained V4 layout identity from normalized resources", () => {
    const spec = routeWorldWithBindings();
    const result = normalizeAuthoringSpecV4(spec);
    const world = result.value;
    const layoutSolveReport = result.layoutSolveReport;
    if (
      result.ok !== true ||
      world === undefined ||
      layoutSolveReport === undefined
    ) {
      throw new Error(`bound fixture normalization failed: ${JSON.stringify(result.diagnostics)}`);
    }

    const layoutResources = projectNormalizedWorldResourcesToLayoutIdentityV4(
      world.resources,
    );
    expect(
      sha256CanonicalJson(
        canonicalAuthoringLayoutIdentityV4(spec, {
          ...world,
          resources: layoutResources,
        }),
      ),
    ).toBe(layoutSolveReport.authoringSpecHash);
    expect(layoutResources.resourceLockHash).toBe(
      layoutSolveReport.registryLockHash,
    );
    expect(layoutResources.resourceLockHash).not.toBe(
      world.resources.resourceLockHash,
    );
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
    expect(firstResult.value?.authoringSpecHash).toBe(
      reorderedResult.value?.authoringSpecHash,
    );
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
