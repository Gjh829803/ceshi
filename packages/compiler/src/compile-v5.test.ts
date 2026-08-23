import { describe, expect, it } from "vitest";

import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { deriveColliderSubshapeIdV1 } from "@whitebox-world/traversal";
import { createValidAuthoringSpec } from "../../authoring/src/test-fixture";

import { compileWorldV5 } from "./index";

function routeWorld(options: {
  seed?: number;
  cone?: boolean;
  collisionEnabled?: boolean;
  constraintId?: string;
  routeId?: string;
  terrainEntityId?: string;
  traversalArea?: boolean;
} = {}): AuthoringSpecV4 {
  const source = createValidAuthoringSpec();
  const prototype = source.resources.prototypes[0]!;
  const routeId = options.routeId ?? "main-route";
  const constraintId = options.constraintId ?? "hero-to-goal";
  const terrainEntityId = options.terrainEntityId ?? "terrain-main";
  return {
    ...source,
    schemaVersion: 4,
    seed: options.seed ?? source.seed,
    resources: {
      ...source.resources,
      prototypes: options.cone
        ? [{
            id: prototype.id,
            version: prototype.version,
            kind: "primitive",
            primitive: "cone",
            radiusMeters: 1,
            heightMeters: 4,
            collisionEnabled: options.collisionEnabled ?? true,
            ...(prototype.semantic === undefined
              ? {}
              : { semantic: prototype.semantic }),
          }]
        : source.resources.prototypes.map((candidate) => ({
            ...candidate,
            collisionEnabled: options.collisionEnabled ?? candidate.collisionEnabled,
          })),
    },
    spatial: {
      ...source.spatial,
      traversalAreas: options.traversalArea === true
        ? [{
            id: "dry-trench",
            kind: "polygon-xz",
            pointsMetersXZ: [[-2, 2], [2, 2], [2, -2], [-2, -2]],
            surfaceEntityId: terrainEntityId,
            mode: "blocked",
          }]
        : [],
      routes: [{
        id: routeId,
        kind: "polyline-xz",
        pointsMetersXZ: [[0, 30], [0, -20]],
        widthMeters: 4,
        locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      }],
    },
    nodes: [
      ...source.nodes.map((node) => {
        if (node.kind === "terrain") return { ...node, id: terrainEntityId };
        if (node.kind === "water") {
          return {
            ...node,
            components: {
              water: {
                ...node.components.water,
                terrainEntityId,
              },
            },
          };
        }
        return node;
      }),
      {
        id: "goal",
        kind: "anchor",
        placement: {
          kind: "fixed",
          transform: { positionMetersXYZ: [0, 0, -20] },
        },
        semantic: { classId: "route.destination" },
      },
    ],
    constraints: {
      placements: source.constraints.placements,
      connectivity: [{
        id: constraintId,
        kind: "connected-by-route",
        requirement: "required",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn-main",
        destinationAnchorEntityId: "goal",
        routeId,
      }],
    },
  };
}

function compile(spec = routeWorld()) {
  const normalized = normalizeAuthoringSpecV4(spec);
  if (!normalized.ok || normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined) {
    throw new Error(`Normalization failed: ${JSON.stringify(normalized.diagnostics)}`);
  }
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (!compiled.ok || compiled.executionPlan === undefined ||
    compiled.executionPlanHash === undefined) {
    throw new Error(`Compilation failed: ${JSON.stringify(compiled.diagnostics)}`);
  }
  return compiled;
}

describe("compileWorldV5", () => {
  it("promotes Heightfield traversal, connectivity, and canonical static colliders", () => {
    const compiled = compile();
    const plan = compiled.executionPlan!;
    const surface = plan.traversal.surfaces[0]!;
    const wall = plan.staticColliders[0]!;

    expect(plan).toMatchObject({
      kind: "worldkit-execution-plan",
      schemaVersion: 5,
      authoringSpecHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      resourceLockEntries: expect.arrayContaining([
        expect.objectContaining({
          resourceKind: "subject-definition",
          resourceRef: "worldkit://subject-definition/humanoid.third-person@1",
          contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        }),
      ]),
      traversal: {
        traversalAreas: [],
        anchorEntityIds: ["goal", "spawn-main"],
        connectivityRequirements: [{
          constraintId: "hero-to-goal",
          kind: "connected-by-route",
          traversingEntityId: "player",
          startAnchorEntityId: "spawn-main",
          destinationAnchorEntityId: "goal",
          routeId: "main-route",
        }],
        surfaces: [expect.objectContaining({
          kind: "heightfield",
          surfaceEntityId: "terrain-main",
        })],
      },
    });
    expect(new Set([
      surface.traversalSurfaceId,
      surface.surfaceEntityId,
      surface.colliderSubshapeId,
    ]).size).toBe(3);
    expect(wall).toMatchObject({
      entityId: "wall-east",
      logicalSubshapeId: "primary",
      colliderSubshapeId: deriveColliderSubshapeIdV1("wall-east", "primary"),
      shape: { kind: "box", sizeMetersXYZ: [2, 4, 14] },
      colliderHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(plan.staticColliders.map((row) => row.colliderSubshapeId))
      .toEqual([...plan.staticColliders]
        .sort((left, right) => left.colliderSubshapeId.localeCompare(right.colliderSubshapeId))
        .map((row) => row.colliderSubshapeId));
    expect(new Set(plan.traversal.anchorEntityIds).size).toBe(
      plan.traversal.anchorEntityIds.length,
    );
    expect(plan.resourceLockEntries).toEqual(
      [...plan.resourceLockEntries].sort((left, right) =>
        left.resourceRef.localeCompare(right.resourceRef) ||
        left.resourceKind.localeCompare(right.resourceKind)),
    );
    expect(compiled.executionPlanHash).toBeDefined();
    const normalized = normalizeAuthoringSpecV4(routeWorld());
    expect(plan.authoringSpecHash).toBe(normalized.value?.authoringSpecHash);
    expect(JSON.stringify(plan)).not.toMatch(/recast|detour|polyRef|provider/i);
  });

  it("compiles blocked traversal areas without changing Runtime terrain collision", () => {
    const baseline = compile(routeWorld());
    const excluded = compile(routeWorld({ traversalArea: true }));

    expect(excluded.executionPlan?.traversal.traversalAreas).toEqual([{
      id: "dry-trench",
      kind: "polygon-xz",
      pointsMetersXZ: [[-2, 2], [2, 2], [2, -2], [-2, -2]],
      surfaceEntityId: "terrain-main",
      mode: "blocked",
    }]);
    expect(excluded.executionPlan?.terrain).toEqual(baseline.executionPlan?.terrain);
    expect(excluded.executionPlanHash).not.toBe(baseline.executionPlanHash);
  });

  it("compiles Heightfields whose sample count exceeds the JavaScript argument limit", () => {
    const source = routeWorld();
    const spec: AuthoringSpecV4 = {
      ...source,
      world: {
        ...source.world,
        resourceBudget: {
          maxVertices: 1_000_000,
          maxTriangles: 2_000_000,
          maxColliders: source.world.resourceBudget.maxColliders,
        },
      },
      nodes: source.nodes.map((node) => node.kind === "terrain"
        ? {
            ...node,
            components: {
              terrain: {
                ...node.components.terrain,
                grid: {
                  ...node.components.terrain.grid,
                  resolutionCellsXZ: [513, 513],
                },
              },
            },
          }
        : node),
    };

    const compiled = compile(spec);

    expect(compiled.executionPlan?.terrain.heightSamplesMeters).toHaveLength(
      513 * 513,
    );
    expect(compiled.executionPlan?.terrain.minimumHeightMeters).toBeTypeOf(
      "number",
    );
    expect(compiled.executionPlan?.terrain.maximumHeightMeters).toBeTypeOf(
      "number",
    );
  }, 15_000);

  it("keeps identities stable across repeated compilation while content hashes geometry", () => {
    const first = compile(routeWorld());
    const repeated = compile(routeWorld());
    const changedTerrain = compile(routeWorld({ seed: 2048 }));
    const firstSurface = first.executionPlan!.traversal.surfaces[0]!;
    const repeatedSurface = repeated.executionPlan!.traversal.surfaces[0]!;
    const changedSurface = changedTerrain.executionPlan!.traversal.surfaces[0]!;

    expect(repeated.executionPlanHash).toBe(first.executionPlanHash);
    expect(repeatedSurface).toEqual(firstSurface);
    expect(changedSurface.traversalSurfaceId).toBe(firstSurface.traversalSurfaceId);
    expect(changedSurface.colliderSubshapeId).toBe(firstSurface.colliderSubshapeId);
    expect(changedSurface.resourceHash).not.toBe(firstSurface.resourceHash);
    expect(changedTerrain.executionPlanHash).not.toBe(first.executionPlanHash);
  });

  it("locks the Runtime cylinder collider for a cone visual", () => {
    const plan = compile(routeWorld({ cone: true })).executionPlan!;

    expect(plan.objects[0]?.primitive.kind).toBe("cone");
    expect(plan.staticColliders[0]?.shape).toEqual({
      kind: "cylinder",
      radiusMeters: 1,
      heightMeters: 4,
    });
  });

  it("hashes the complete V5 plan, including traversal-only connectivity", () => {
    const baseline = compile(routeWorld());
    const changedConnectivity = compile(routeWorld({ constraintId: "hero-to-goal-alt" }));
    const changedSurface = compile(routeWorld({ terrainEntityId: "terrain-alt" }));
    const collisionDisabled = compile(routeWorld({ collisionEnabled: false }));

    expect(baseline.executionPlanHash).toBe(
      sha256CanonicalJson(baseline.executionPlan),
    );
    expect(changedConnectivity.executionPlanHash).not.toBe(baseline.executionPlanHash);
    expect(changedConnectivity.executionPlan!.authoringSpecHash).not.toBe(
      baseline.executionPlan!.authoringSpecHash,
    );
    const v4Payload = (plan: NonNullable<typeof baseline.executionPlan>) => {
      const {
        schemaVersion: _schemaVersion,
        authoringSpecHash: _authoringSpecHash,
        normalizedWorldIrHash: _normalizedWorldIrHash,
        traversal: _traversal,
        staticColliders: _staticColliders,
        ...payload
      } = plan;
      return payload;
    };
    expect(v4Payload(changedConnectivity.executionPlan!)).toEqual(
      v4Payload(baseline.executionPlan!),
    );
    expect(changedSurface.executionPlan!.traversal.surfaces[0]!.traversalSurfaceId)
      .not.toBe(baseline.executionPlan!.traversal.surfaces[0]!.traversalSurfaceId);
    expect(changedSurface.executionPlanHash).not.toBe(baseline.executionPlanHash);
    expect(collisionDisabled.executionPlan!.staticColliders).toEqual([]);
  });
});
