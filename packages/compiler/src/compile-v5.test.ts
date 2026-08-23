import { describe, expect, it, vi } from "vitest";

const colliderSubshapeIdFault = vi.hoisted(() => ({
  isEnabled: false,
  invocationCount: 0,
}));

const traversalSurfaceIdFault = vi.hoisted(() => ({
  isEnabled: false,
}));

vi.mock("@whitebox-world/traversal", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@whitebox-world/traversal")
  >();
  return {
    ...actual,
    deriveColliderSubshapeIdV1(
      entityId: string,
      logicalSubshapeId: string,
    ) {
      colliderSubshapeIdFault.invocationCount += 1;
      if (
        colliderSubshapeIdFault.isEnabled &&
        colliderSubshapeIdFault.invocationCount === 1
      ) {
        return `collider-subshape:sha256:${"f".repeat(64)}` as const;
      }
      return actual.deriveColliderSubshapeIdV1(entityId, logicalSubshapeId);
    },
  };
});

vi.mock("@whitebox-world/protocol", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@whitebox-world/protocol")
  >();
  return {
    ...actual,
    sha256CanonicalJson(value: unknown) {
      const candidate = value as {
        kind?: unknown;
        logicalSurfaceId?: unknown;
        surfaceEntityId?: unknown;
      };
      if (
        traversalSurfaceIdFault.isEnabled &&
        candidate.kind === "static-collider" &&
        typeof candidate.logicalSurfaceId === "string" &&
        typeof candidate.surfaceEntityId === "string"
      ) {
        return `sha256:${"e".repeat(64)}` as const;
      }
      return actual.sha256CanonicalJson(value);
    },
  };
});

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
  staticSurface?: boolean;
  secondInstance?: boolean;
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
            ...(options.staticSurface === true
              ? {
                  traversalSurfaceBindings: [{
                    id: "deck",
                    kind: "collider-subshape" as const,
                    logicalSubshapeId: "primary",
                    traversalSurfaceProfileRef:
                      "worldkit://traversal-surface-profile/ground.static@1",
                  }],
                }
              : {}),
            ...(prototype.semantic === undefined
              ? {}
              : { semantic: prototype.semantic }),
          }]
        : source.resources.prototypes.map((candidate) => ({
            ...candidate,
            collisionEnabled: options.collisionEnabled ?? candidate.collisionEnabled,
            ...(options.staticSurface === true
              ? {
                  traversalSurfaceBindings: [{
                    id: "deck",
                    kind: "collider-subshape" as const,
                    logicalSubshapeId: "primary",
                    traversalSurfaceProfileRef:
                      "worldkit://traversal-surface-profile/ground.static@1",
                  }],
                }
              : {}),
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
      ...(options.secondInstance === true
        ? [{
            id: "wall-west",
            kind: "object" as const,
            prototypeRef: "package://prototype/wall@1",
            placement: {
              kind: "fixed" as const,
              transform: { positionMetersXYZ: [-12, 2, 10] as const },
            },
          }]
        : []),
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
  it("rejects a hash-consistent IR whose Resource Lock hash contradicts its entries", () => {
    const normalized = normalizeAuthoringSpecV4(
      routeWorld({ staticSurface: true }),
    );
    if (!normalized.ok || normalized.value === undefined) {
      throw new Error("Bound fixture normalization failed.");
    }
    const forged = structuredClone(normalized.value);
    forged.resources.resourceLockHash = `sha256:${"f".repeat(64)}`;

    const result = compileWorldV5({
      normalizedWorldIr: forged,
      normalizedWorldIrHash: sha256CanonicalJson(forged),
    });

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_IR_INVALID",
        instancePath: "/normalizedWorldIr",
        message: "Resource Lock hash does not match canonical entries.",
      }],
    });
    expect(result).not.toHaveProperty("executionPlan");
    expect(result).not.toHaveProperty("executionPlanHash");
  });

  it("compiles one exact static Surface-to-Collider join per bound Object instance", () => {
    const plan = compile(routeWorld({
      staticSurface: true,
      secondInstance: true,
    })).executionPlan!;
    const surfaces = plan.traversal.surfaces.filter(
      (surface) => surface.kind === "static-collider",
    );

    expect(surfaces).toHaveLength(2);
    expect(new Set(surfaces.map((surface) => surface.surfaceEntityId))).toEqual(
      new Set(["wall-east", "wall-west"]),
    );
    expect(surfaces.map((surface) => surface.traversalSurfaceId)).toEqual(
      [...surfaces]
        .sort((left, right) =>
          left.traversalSurfaceId.localeCompare(right.traversalSurfaceId))
        .map((surface) => surface.traversalSurfaceId),
    );
    for (const surface of surfaces) {
      const matchingColliders = plan.staticColliders.filter(
        (collider) =>
          collider.entityId === surface.surfaceEntityId &&
          collider.logicalSubshapeId === surface.logicalSubshapeId,
      );
      expect(matchingColliders).toHaveLength(1);
      const collider = matchingColliders[0]!;
      expect(surface.surfaceEntityId).toBe(collider.entityId);
      expect(surface.logicalSubshapeId).toBe(collider.logicalSubshapeId);
      expect(surface.colliderSubshapeId).toBe(collider.colliderSubshapeId);
      expect(surface.colliderSubshapeId).toBe(deriveColliderSubshapeIdV1(
        surface.surfaceEntityId,
        surface.logicalSubshapeId,
      ));
      expect(surface.colliderHash).toBe(collider.colliderHash);
      expect(surface.traversalSurfaceProfileRef).toBe(
        "worldkit://traversal-surface-profile/ground.static@1",
      );
      expect(surface.resourceHash).toBe(sha256CanonicalJson({
        prototypeId: "wall",
        prototypeVersion: 1,
        binding: {
          id: "deck",
          kind: "collider-subshape",
          logicalSubshapeId: "primary",
          traversalSurfaceProfileRef:
            "worldkit://traversal-surface-profile/ground.static@1",
        },
        traversalSurfaceProfileRef:
          "worldkit://traversal-surface-profile/ground.static@1",
        traversalSurfaceProfileResolvedVersion: "1",
        traversalSurfaceProfileHash:
          "sha256:16d21f75625a849156be42b27c11cea30f461292f346ce8aae52f6049f0aa4d4",
        colliderHash: collider.colliderHash,
      }));
    }
  });

  it("strictly sorts and deep-freezes the enlarged Execution Surface union", () => {
    const surfaces = compile(routeWorld({
      staticSurface: true,
      secondInstance: true,
    })).executionPlan!.traversal.surfaces;
    const traversalSurfaceIds = surfaces.map(
      (surface) => surface.traversalSurfaceId,
    );

    expect(traversalSurfaceIds).toEqual([...traversalSurfaceIds].sort());
    expect(new Set(traversalSurfaceIds).size).toBe(traversalSurfaceIds.length);
    expect(Object.isFrozen(surfaces)).toBe(true);
    for (const surface of surfaces) expect(Object.isFrozen(surface)).toBe(true);
  });

  it("keeps the frozen R1 Heightfield traversalSurfaceId byte-identical", () => {
    const baseline = compile(routeWorld()).executionPlan!.traversal.surfaces
      .find((surface) => surface.kind === "heightfield")!;
    const withStaticSurface = compile(routeWorld({ staticSurface: true }))
      .executionPlan!.traversal.surfaces
      .find((surface) => surface.kind === "heightfield")!;

    expect(baseline.traversalSurfaceId).toBe(
      "traversal-surface:sha256:f9a56d8e45affe3245ef4830b3c9d07b0cb08ee4e059b592fb1eb36d2cd43422",
    );
    expect(withStaticSurface.traversalSurfaceId).toBe(
      baseline.traversalSurfaceId,
    );
  });

  it("rejects a forged hash-consistent normalized binding with no Collider join", () => {
    const normalized = normalizeAuthoringSpecV4(
      routeWorld({ staticSurface: true }),
    );
    if (!normalized.ok || normalized.value === undefined) {
      throw new Error("Bound fixture normalization failed.");
    }
    const forged = structuredClone(normalized.value);
    const forgedBinding = forged.resources.prototypes[0]!
      .traversalSurfaceBindings![0]! as {
        logicalSubshapeId: string;
      };
    forgedBinding.logicalSubshapeId = "forged-subshape";

    expect(compileWorldV5({
      normalizedWorldIr: forged,
      normalizedWorldIrHash: sha256CanonicalJson(forged),
    })).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "COMPILER_NORMALIZED_IR_INVALID",
        message: expect.stringMatching(/Collider join/),
      })]),
    });
  });

  it("rejects a forged Collider row whose Subshape id is not its derivation", () => {
    const normalized = normalizeAuthoringSpecV4(
      routeWorld({ staticSurface: true }),
    );
    if (!normalized.ok || normalized.value === undefined) {
      throw new Error("Bound fixture normalization failed.");
    }
    colliderSubshapeIdFault.invocationCount = 0;
    colliderSubshapeIdFault.isEnabled = true;
    const result = compileWorldV5({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: sha256CanonicalJson(normalized.value),
    });
    colliderSubshapeIdFault.isEnabled = false;

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_IR_INVALID",
        instancePath: "/normalizedWorldIr",
        message:
          "Traversal Surface Collider join for 'wall-east.deck' has a non-canonical colliderSubshapeId.",
      }],
    });
    expect(result).not.toHaveProperty("executionPlan");
    expect(result).not.toHaveProperty("executionPlanHash");
  });

  it("rejects a hash-consistent normalized binding with an unknown provider field", () => {
    const normalized = normalizeAuthoringSpecV4(
      routeWorld({ staticSurface: true }),
    );
    if (!normalized.ok || normalized.value === undefined) {
      throw new Error("Bound fixture normalization failed.");
    }
    const forged = structuredClone(normalized.value);
    const forgedBinding = forged.resources.prototypes[0]!
      .traversalSurfaceBindings![0]! as unknown as Record<string, unknown>;
    forgedBinding.providerArea = 7;

    const result = compileWorldV5({
      normalizedWorldIr: forged,
      normalizedWorldIrHash: sha256CanonicalJson(forged),
    });

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_IR_INVALID",
        instancePath: "/normalizedWorldIr",
        message: "Traversal Surface binding 'wall.deck' is invalid.",
      }],
    });
    expect(result).not.toHaveProperty("executionPlan");
    expect(result).not.toHaveProperty("executionPlanHash");
  });

  it("rejects a hash-consistent IR with a duplicated bound Prototype identity", () => {
    const normalized = normalizeAuthoringSpecV4(
      routeWorld({ staticSurface: true }),
    );
    if (!normalized.ok || normalized.value === undefined) {
      throw new Error("Bound fixture normalization failed.");
    }
    const forged = structuredClone(normalized.value);
    const prototypes = forged.resources.prototypes as Array<
      (typeof forged.resources.prototypes)[number]
    >;
    prototypes.push(structuredClone(prototypes[0]!));

    const result = compileWorldV5({
      normalizedWorldIr: forged,
      normalizedWorldIrHash: sha256CanonicalJson(forged),
    });

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_IR_INVALID",
        instancePath: "/normalizedWorldIr",
        message: "Prototype identity 'wall@1' is duplicated.",
      }],
    });
    expect(result).not.toHaveProperty("executionPlan");
    expect(result).not.toHaveProperty("executionPlanHash");
  });

  it("independently rejects duplicate emitted Traversal Surface ids", () => {
    const normalized = normalizeAuthoringSpecV4(
      routeWorld({ staticSurface: true, secondInstance: true }),
    );
    if (
      !normalized.ok ||
      normalized.value === undefined ||
      normalized.normalizedWorldIrHash === undefined
    ) {
      throw new Error("Bound fixture normalization failed.");
    }
    traversalSurfaceIdFault.isEnabled = true;
    let result: ReturnType<typeof compileWorldV5>;
    try {
      result = compileWorldV5({
        normalizedWorldIr: normalized.value,
        normalizedWorldIrHash: normalized.normalizedWorldIrHash,
      });
    } finally {
      traversalSurfaceIdFault.isEnabled = false;
    }

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_IR_INVALID",
        instancePath: "/normalizedWorldIr",
        message:
          `Traversal Surface id 'traversal-surface:sha256:${"e".repeat(64)}' is duplicated.`,
      }],
    });
    expect(result).not.toHaveProperty("executionPlan");
    expect(result).not.toHaveProperty("executionPlanHash");
  });

  it("rejects a hash-consistent IR whose distinct Prototype Object reuses an entity id", () => {
    const normalized = normalizeAuthoringSpecV4(
      routeWorld({ staticSurface: true }),
    );
    if (!normalized.ok || normalized.value === undefined) {
      throw new Error("Bound fixture normalization failed.");
    }
    const forged = structuredClone(normalized.value);
    const prototypes = forged.resources.prototypes as Array<
      (typeof forged.resources.prototypes)[number]
    >;
    const secondPrototype = structuredClone(prototypes[0]!) as unknown as {
      id: string;
      collisionEnabled: boolean;
      traversalSurfaceBindings: Array<{ id: string }>;
    };
    secondPrototype.id = "platform-alt";
    secondPrototype.collisionEnabled = false;
    secondPrototype.traversalSurfaceBindings[0]!.id = "upper-deck";
    prototypes.push(
      secondPrototype as unknown as (typeof prototypes)[number],
    );
    const nodes = forged.nodes as Array<(typeof forged.nodes)[number]>;
    const secondObjectNode = structuredClone(
      nodes.find((node) => node.kind === "object")!,
    ) as unknown as { prototypeRef: string };
    secondObjectNode.prototypeRef = "package://prototype/platform-alt@1";
    nodes.push(secondObjectNode as (typeof nodes)[number]);

    const result = compileWorldV5({
      normalizedWorldIr: forged,
      normalizedWorldIrHash: sha256CanonicalJson(forged),
    });

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_IR_INVALID",
        instancePath: "/normalizedWorldIr",
        message: "Node entity id 'wall-east' is duplicated.",
      }],
    });
    expect(result).not.toHaveProperty("executionPlan");
    expect(result).not.toHaveProperty("executionPlanHash");
  });

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
    expect(plan.resourceLockHash).toBe(
      sha256CanonicalJson(plan.resourceLockEntries),
    );
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
