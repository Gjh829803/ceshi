import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import {
  compileResolvedTraversalLockV1,
  compileWorldV5,
} from "@whitebox-world/compiler";
import type {
  ExecutionPlanV4,
  ExecutionPlanV5,
} from "@whitebox-world/runtime-contracts";
import { TRUSTED_DEFAULT_CONTROLLER_ID } from "@whitebox-world/runtime-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { emitStaticColliderTriangleMeshV1 } from "@whitebox-world/terrain-surface";
import {
  assertTraversalRuntimeWorldIdentityMatchesGraphV1,
  resolveTraversalLockV1,
  TraversalRuntimeErrorV1,
  type ResolvedTraversalLockReceiptV1,
} from "@whitebox-world/traversal";
import { describe, expect, it, vi } from "vitest";

import {
  createValidAuthoringSpec,
  createValidPackageSubjectWorld,
} from "../../authoring/src/test-fixture";
import {
  BabylonWorldRuntime,
  isWorldRuntimeLayoutAssertionErrorV1,
} from "./babylon-world-runtime";
import { BABYLON_TRAVERSAL_RUNTIME_INTERNAL } from "./traversal-runtime-internal";
import { createBabylonTraversalRuntimePortV1 } from "./traversal-runtime-port";
import {
  BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
} from "./traversal-implementation-identity";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve(
    "@babylonjs/havok/lib/esm/HavokPhysics.wasm",
  ),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

function routeWorld(
  source = createValidAuthoringSpec(),
): AuthoringSpecV4 {
  return {
    ...source,
    schemaVersion: 4,
    spatial: {
      ...source.spatial,
      traversalAreas: [],
      routes: [{
        id: "main-route",
        kind: "polyline-xz",
        pointsMetersXZ: [[0, 30], [0, -20]],
        widthMeters: 4,
        locomotionProfileRef:
          "worldkit://locomotion-profile/ground.standard@1",
      }],
    },
    nodes: [
      ...source.nodes.map((node) =>
        node.kind === "terrain" &&
          node.components.terrain.source.kind === "procedural"
          ? {
              ...node,
              components: {
                terrain: {
                  ...node.components.terrain,
                  source: {
                    ...node.components.terrain.source,
                    relief: "flat" as const,
                    baseHeightMeters: 0,
                    amplitudeMeters: 0,
                  },
                },
              },
            }
          : node
      ),
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

function compileFixture(world = routeWorld()): {
  normalizedWorldIr: NormalizedWorldIRV4;
  executionPlan: ExecutionPlanV5;
  traversalLockReceipt: ResolvedTraversalLockReceiptV1;
} {
  const normalized = normalizeAuthoringSpecV4(world);
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    throw new Error("Route fixture normalization failed.");
  }
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (!compiled.ok || compiled.executionPlan === undefined) {
    throw new Error("Route fixture compilation failed.");
  }
  const traversalLockReceipt = compileResolvedTraversalLockV1({
    normalizedWorldIr: normalized.value,
    executionPlan: compiled.executionPlan,
    traversingEntityId: "player",
    runtimeImplementationIdentity:
      BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
  });
  return {
    normalizedWorldIr: normalized.value,
    executionPlan: compiled.executionPlan,
    traversalLockReceipt,
  };
}

async function createRuntime(
  executionPlan: ExecutionPlanV4 | ExecutionPlanV5,
): Promise<BabylonWorldRuntime> {
  return BabylonWorldRuntime.create({
    executionPlan,
    havokWasmBinary,
    autoStartRenderLoop: false,
    engineFactory: () => new NullEngine({
      renderWidth: 320,
      renderHeight: 180,
      textureSize: 256,
      deterministicLockstep: true,
      lockstepMaxSteps: 4,
    }),
  });
}

function expectRuntimeCode(
  operation: () => unknown,
  code: TraversalRuntimeErrorV1["code"],
): void {
  try {
    operation();
    throw new Error("Expected traversal runtime operation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(TraversalRuntimeErrorV1);
    expect((error as TraversalRuntimeErrorV1).code).toBe(code);
    expect((error as Error).message).toBe(code);
  }
}

function withStaticBoxAtStart(
  fixture: ReturnType<typeof compileFixture>,
  heightMeters: number,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  const startPlacement = {
    ...placement,
      transform: {
      ...placement.transform,
      positionMetersXYZ: [
        placement.transform.positionMetersXYZ[0],
        heightMeters,
        placement.transform.positionMetersXYZ[2],
      ] as const,
    },
  };
  const supportCollider = {
    entityId: `support-box-${heightMeters}`,
    logicalSubshapeId: "primary",
    colliderSubshapeId: `collider:support-box-${heightMeters}:primary`,
    colliderHash: `sha256:${"c".repeat(64)}` as const,
    transform: {
      positionMetersXYZ: [
        placement.transform.positionMetersXYZ[0],
        heightMeters / 2,
        placement.transform.positionMetersXYZ[2],
      ] as const,
      rotationEulerRadiansXYZ: [0, 0.37, 0] as const,
      scaleXYZ: [1.5, 1, 0.5] as const,
    },
    shape: {
      kind: "box" as const,
      sizeMetersXYZ: [2, heightMeters, 2] as const,
    },
  };
  return {
    ...plan,
    layout: {
      ...plan.layout,
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        "spawn-main": startPlacement,
      },
    },
    staticColliders: [
    ...plan.staticColliders,
      supportCollider,
    ],
  };
}

function withAsymmetricSaddleAtStart(
  fixture: ReturnType<typeof compileFixture>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  return {
    ...plan,
    terrain: {
      ...plan.terrain,
      centerMetersXZ: [0, 30],
      sizeMetersXZ: [2, 2],
      resolutionCellsXZ: [2, 2],
      heightSamplesMeters: [0, 0.2, 0.4, 0],
      minimumHeightMeters: 0,
      maximumHeightMeters: 0.4,
    },
    layout: {
      ...plan.layout,
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        "spawn-main": {
          ...placement,
          transform: {
            ...placement.transform,
            positionMetersXYZ: [0, 0.3, 30],
          },
        },
      },
    },
  };
}

function withOutsideTerrainStaticSupport(
  fixture: ReturnType<typeof compileFixture>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  const outsidePosition = [1_000, 1, 1_000] as const;
  return {
    ...plan,
    layout: {
      ...plan.layout,
      layoutAssertions: [],
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        "spawn-main": {
          ...placement,
          transform: {
            ...placement.transform,
            positionMetersXYZ: outsidePosition,
          },
        },
      },
    },
    staticColliders: [
      ...plan.staticColliders,
      {
        entityId: "outside-support",
        logicalSubshapeId: "primary",
        colliderSubshapeId: "collider:outside-support:primary",
        colliderHash: `sha256:${"d".repeat(64)}`,
        transform: {
          positionMetersXYZ: [outsidePosition[0], 0.5, outsidePosition[2]],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        shape: { kind: "box", sizeMetersXYZ: [4, 1, 4] },
      },
    ],
  };
}

function withNearbyRotatedCurbOutsideFootColumn(
  fixture: ReturnType<typeof compileFixture>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const [footX, , footZ] = plan.layout
    .placementsByEntityId["spawn-main"]!.transform.positionMetersXYZ;
  // The 45-degree curb's world AABB covers the foot, but its exact thin strip
  // stays outside the vertical XZ column through that foot sample.
  return {
    ...plan,
    staticColliders: [
      ...plan.staticColliders,
      {
        entityId: "nearby-curb",
        logicalSubshapeId: "primary",
        colliderSubshapeId: "collider:nearby-curb:primary",
        colliderHash: `sha256:${"e".repeat(64)}`,
        transform: {
          positionMetersXYZ: [footX, 0.05, footZ + 1],
          rotationEulerRadiansXYZ: [0, Math.PI / 4, 0],
          scaleXYZ: [1, 1, 1],
        },
        shape: { kind: "box", sizeMetersXYZ: [4, 0.1, 0.2] },
      },
    ],
  };
}

function withTieredStaticSupportAssertion(
  fixture: ReturnType<typeof compileFixture>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const supportedEntityId = "wall-east";
  const supportingEntityId = "tiered-support";
  const supportedTransform = {
    positionMetersXYZ: [20, 1.5, 20] as const,
    rotationEulerRadiansXYZ: [0, 0, 0] as const,
    scaleXYZ: [1, 1, 1] as const,
  };
  const originalPlacement =
    plan.layout.placementsByEntityId[supportedEntityId]!;
  return {
    ...plan,
    objects: plan.objects.map((object) =>
      object.entityId === supportedEntityId
        ? {
            ...object,
            primitive: {
              kind: "box" as const,
              sizeMetersXYZ: [1, 1, 1] as const,
            },
            transform: supportedTransform,
            collisionEnabled: false,
          }
        : object
    ),
    layout: {
      ...plan.layout,
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        [supportedEntityId]: {
          ...originalPlacement,
          transform: supportedTransform,
        },
        [supportingEntityId]: {
          entityId: supportingEntityId,
          transform: {
            positionMetersXYZ: [20, 0.5, 20],
            rotationEulerRadiansXYZ: [0, 0, 0],
            scaleXYZ: [1, 1, 1],
          },
          placementProvenance: originalPlacement.placementProvenance,
        },
      },
      layoutAssertions: [{
        constraintId: "wall-on-tiered-support",
        kind: "supported-by",
        supportedEntityId,
        supportingEntityId,
        maximumSupportGapMeters: 0.01,
        minimumSupportRatio: 1,
        evidenceEntityIds: [supportedEntityId, supportingEntityId],
        measurements: {},
        tolerances: {},
      }],
    },
    staticColliders: [
      ...plan.staticColliders.filter(
        (collider) => collider.entityId !== supportedEntityId,
      ),
      {
        entityId: supportingEntityId,
        logicalSubshapeId: "low",
        colliderSubshapeId: "collider:tiered-support:low",
        colliderHash: `sha256:${"f".repeat(64)}`,
        transform: {
          positionMetersXYZ: [20, 0.25, 20],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        shape: { kind: "box", sizeMetersXYZ: [4, 0.5, 4] },
      },
      {
        entityId: supportingEntityId,
        logicalSubshapeId: "high",
        colliderSubshapeId: "collider:tiered-support:high",
        colliderHash: `sha256:${"1".repeat(64)}`,
        transform: {
          positionMetersXYZ: [20, 0.5, 20],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        shape: { kind: "box", sizeMetersXYZ: [4, 1, 4] },
      },
    ],
  };
}

function withStartTransform(
  fixture: ReturnType<typeof compileFixture>,
  transform: Readonly<{
    positionMetersXYZ: readonly [number, number, number];
    rotationEulerRadiansXYZ: readonly [number, number, number];
    scaleXYZ: readonly [number, number, number];
  }>,
): ExecutionPlanV5 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  return {
    ...plan,
    layout: {
      ...plan.layout,
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        "spawn-main": {
          ...placement,
          transform,
        },
      },
    },
  };
}

describe("createBabylonTraversalRuntimePortV1", () => {
  it("fails closed for a V4 Runtime before evaluating traversal lock details", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime({
      ...fixture.executionPlan,
      schemaVersion: 4,
    } as unknown as ExecutionPlanV4);
    try {
      expectRuntimeCode(
        () => createBabylonTraversalRuntimePortV1({
          runtime,
          traversalLockReceipt: fixture.traversalLockReceipt,
        }),
        "TRAVERSAL_RUNTIME_PLAN_NOT_V5",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("requires a port-owned reset, then publishes immutable resolved terrain evidence", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      expectRuntimeCode(
        () => port.readLatestTickEvidence(),
        "TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE",
      );

      const controller = (runtime as unknown as {
        subjectControllersByEntityId: Map<string, {
          physicsController: { checkSupport: (...args: unknown[]) => unknown };
        }>;
      }).subjectControllersByEntityId.get("player")!;
      const supportSpy = vi.spyOn(controller.physicsController, "checkSupport");
      const resetEvidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(supportSpy).toHaveBeenCalledTimes(1);
      expect(resetEvidence).toMatchObject({
        kind: "traversal-runtime-tick-evidence",
        schemaVersion: 1,
        tick: 0,
        traversingEntityId: "player",
        resolvedTraversalLockHash:
          fixture.traversalLockReceipt.resolvedTraversalLockHash,
        movementMedium: "ground",
        characterSupport: {
          kind: "character-support-evidence",
          schemaVersion: 1,
          supportState: "supported",
          isSupportSurfaceDynamic: false,
          surfaceResolution: {
            mode: "resolved",
            traversalSurfaceId:
              fixture.executionPlan.traversal.surfaces[0]!.traversalSurfaceId,
          },
        },
      });
      expect(Object.isFrozen(resetEvidence)).toBe(true);
      expect(Object.isFrozen(resetEvidence.characterSupport)).toBe(true);

      supportSpy.mockClear();
      expect(port.readLatestTickEvidence()).toEqual(resetEvidence);
      expect(supportSpy).not.toHaveBeenCalled();
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects a Runtime Port from a different legal world before reset even when both worlds share one traversal lock", async () => {
    const worldA = compileFixture();
    const worldBSpec = structuredClone(routeWorld());
    const goal = worldBSpec.nodes.find((node) => node.id === "goal");
    if (goal?.kind !== "anchor" || goal.placement.kind !== "fixed") {
      throw new Error("Expected the route fixture to contain a fixed goal Anchor.");
    }
    goal.placement.transform.positionMetersXYZ = [7, 0, -20];
    const worldB = compileFixture(worldBSpec);
    expect(worldB.traversalLockReceipt.resolvedTraversalLockHash).toBe(
      worldA.traversalLockReceipt.resolvedTraversalLockHash,
    );
    expect(worldB.executionPlan.authoringSpecHash).not.toBe(
      worldA.executionPlan.authoringSpecHash,
    );

    const runtime = await createRuntime(worldB.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: worldB.traversalLockReceipt,
      });
      expect(() => assertTraversalRuntimeWorldIdentityMatchesGraphV1({
        traversalGraph: {
          authoringSpecHash: worldA.executionPlan.authoringSpecHash,
          layoutSolveReportHash:
            worldA.executionPlan.layout.layoutSolveReportHash as `sha256:${string}`,
          resourceLockHash:
            worldA.executionPlan.resourceLockHash as `sha256:${string}`,
        },
        runtimeWorldIdentity: port,
      })).toThrow("TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH");
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("keeps provider internals private and runtime provenance immutable", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });

      expect(Object.keys(port)).not.toEqual(expect.arrayContaining([
        "host",
        "plan",
        "receipt",
        "lock",
      ]));
      expect(Object.isFrozen(port)).toBe(true);
      expect(() => {
        (port as { resolvedTraversalLockHash: string })
          .resolvedTraversalLockHash = `sha256:${"e".repeat(64)}`;
      }).toThrow(TypeError);

      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      expect(evidence.resolvedTraversalLockHash).toBe(
        fixture.traversalLockReceipt.resolvedTraversalLockHash,
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects canonical world drift introduced after Runtime creation", async () => {
    const fixture = compileFixture();
    const plan = withStaticBoxAtStart(fixture, 0.1);
    const runtime = await createRuntime(plan);
    try {
      const mutablePlan = plan as unknown as {
        terrain: { heightSamplesMeters: number[] };
        staticColliders: Array<{
          transform: { positionMetersXYZ: number[] };
        }>;
        layout: {
          placementsByEntityId: Record<
            string,
            { transform: { positionMetersXYZ: number[] } }
          >;
        };
      };
      mutablePlan.terrain.heightSamplesMeters[0] =
        mutablePlan.terrain.heightSamplesMeters[0]! + 0.25;
      const staticPosition = mutablePlan.staticColliders.at(-1)!
        .transform.positionMetersXYZ;
      staticPosition[0] = staticPosition[0]! + 0.5;
      const anchorPosition = mutablePlan.layout.placementsByEntityId[
        "spawn-main"
      ]!.transform.positionMetersXYZ;
      anchorPosition[2] = anchorPosition[2]! + 1;

      expectRuntimeCode(
        () => createBabylonTraversalRuntimePortV1({
          runtime,
          traversalLockReceipt: fixture.traversalLockReceipt,
        }),
        "TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("closes non-canonical world drift introduced after Runtime creation", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const samples = fixture.executionPlan.terrain
        .heightSamplesMeters as unknown[];
      samples[0] = 1n;

      expectRuntimeCode(
        () => createBabylonTraversalRuntimePortV1({
          runtime,
          traversalLockReceipt: fixture.traversalLockReceipt,
        }),
        "TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects in-place V5 Plan drift even when its published world hashes stay unchanged", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const originalExecutionPlanHash = port.executionPlanHash;
      const samples = fixture.executionPlan.terrain.heightSamplesMeters as number[];
      samples[0] = samples[0]! + 0.25;

      expect(port.executionPlanHash).toBe(originalExecutionPlanHash);
      expectRuntimeCode(
        () => port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" }),
        "TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("closes canonical hashing failures from adversarial in-place V5 Plan drift", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const samples = fixture.executionPlan.terrain.heightSamplesMeters as unknown[];
      samples[0] = 1n;

      expectRuntimeCode(
        () => port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" }),
        "TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects a forged receipt hash and invalid Anchor with closed codes", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      expectRuntimeCode(
        () => createBabylonTraversalRuntimePortV1({
          runtime,
          traversalLockReceipt: {
            ...fixture.traversalLockReceipt,
            resolvedTraversalLockHash: `sha256:${"f".repeat(64)}`,
          },
        }),
        "TRAVERSAL_RUNTIME_LOCK_MISMATCH",
      );
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      expectRuntimeCode(
        () => port.resetToStartAnchor({ startAnchorEntityId: "not-an-anchor" }),
        "TRAVERSAL_RUNTIME_START_ANCHOR_INVALID",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects every forged resource hash even when the receipt hash is recomputed", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const resourceHashFields = [
        "colliderProfileHash",
        "physicsBodyProfileHash",
        "locomotionProfileHash",
        "locomotionCapabilityHash",
        "controlFeelProfileHash",
        "controlProfileHash",
        "motionProfileHash",
        "motionKernelHash",
        "mediumProfileHash",
        "subjectDefinitionHash",
      ] as const;
      for (const field of resourceHashFields) {
        const forgedReceipt = resolveTraversalLockV1({
          ...fixture.traversalLockReceipt.lock,
          [field]: `sha256:${"e".repeat(64)}`,
        });
        expectRuntimeCode(
          () => createBabylonTraversalRuntimePortV1({
            runtime,
            traversalLockReceipt: forgedReceipt,
          }),
          "TRAVERSAL_RUNTIME_LOCK_MISMATCH",
        );
      }
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects a self-consistent Plan Resource Lock from a different world lock", async () => {
    const fixture = compileFixture();
    const plan = structuredClone(fixture.executionPlan);
    const unrelatedEntry = plan.resourceLockEntries.find(
      (entry) => entry.resourceKind === "subject-definition",
    )!;
    (unrelatedEntry as { resolvedVersion: string }).resolvedVersion = "forged";
    (plan as { resourceLockHash: string }).resourceLockHash =
      sha256CanonicalJson(plan.resourceLockEntries);
    const runtime = await createRuntime(plan);
    try {
      expectRuntimeCode(
        () => createBabylonTraversalRuntimePortV1({
          runtime,
          traversalLockReceipt: fixture.traversalLockReceipt,
        }),
        "TRAVERSAL_RUNTIME_LOCK_MISMATCH",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("publishes unsupported air evidence without a surface identity", async () => {
    const fixture = compileFixture();
    const plan = withStartTransform(fixture, {
      positionMetersXYZ: [0, 2, 30],
      rotationEulerRadiansXYZ: [0, 0, 0],
      scaleXYZ: [1, 1, 1],
    });
    const runtime = await createRuntime(plan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(evidence).toMatchObject({
        movementMedium: "air",
        locomotionMode: "airborne",
        characterSupport: {
          supportState: "unsupported",
          surfaceResolution: { mode: "unsupported" },
        },
      });
      expect(Object.keys(evidence.characterSupport.surfaceResolution))
        .toEqual(["mode"]);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("resets Subject Origin at the Anchor, applies yaw only, and preserves collider offset", async () => {
    const fixture = compileFixture();
    const anchorPosition = [1, 0, 29] as const;
    const yawRadians = 0.7;
    const plan = withStartTransform(fixture, {
      positionMetersXYZ: anchorPosition,
      rotationEulerRadiansXYZ: [0.4, yawRadians, -0.3],
      scaleXYZ: [2, 3, 4],
    });
    const runtime = await createRuntime(plan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      const controller = (runtime as unknown as {
        subjectControllersByEntityId: Map<string, {
          controllerCenter: { x: number; y: number; z: number };
          motionSnapshot(): { forwardXYZ: readonly number[] };
        }>;
      }).subjectControllersByEntityId.get("player")!;
      const offset = fixture.traversalLockReceipt.lock
        .colliderCenterOffsetMetersXYZ;

      expect(evidence.subjectPositionMetersXYZ).toEqual(anchorPosition);
      expect([
        controller.controllerCenter.x,
        controller.controllerCenter.y,
        controller.controllerCenter.z,
      ]).toEqual([
        anchorPosition[0] + offset[0],
        anchorPosition[1] + offset[1],
        anchorPosition[2] + offset[2],
      ]);
      expect(controller.motionSnapshot().forwardXYZ).toEqual([
        -Math.sin(yawRadians),
        0,
        -Math.cos(yawRadians),
      ]);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("submits one canonical world-XZ tick without consulting the camera frame", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      const cameraFrameSpy = vi.spyOn(
        (runtime as unknown as {
          cameraDirector: { controlFrame: (...args: unknown[]) => unknown };
        }).cameraDirector,
        "controlFrame",
      );

      const controller = (runtime as unknown as {
        subjectControllersByEntityId: Map<string, {
          physicsController: { checkSupport: (...args: unknown[]) => unknown };
        }>;
      }).subjectControllersByEntityId.get("player")!;
      const supportSpy = vi.spyOn(controller.physicsController, "checkSupport");
      const before = port.readLatestTickEvidence();

      const next = await port.runFixedTick({
        walkDirectionWorldXZ: [0, -1],
      });

      expect(supportSpy).toHaveBeenCalledTimes(1);
      expect(next.tick).toBe(1);
      expect(next.velocityMetersPerSecondXYZ[2]).toBeLessThan(0);
      expect(next.characterSupport.sampledFootPositionMetersXYZ[2]).toBe(
        before.subjectPositionMetersXYZ[2],
      );
      expect(next.subjectPositionMetersXYZ[2]).toBeLessThan(
        next.characterSupport.sampledFootPositionMetersXYZ[2],
      );
      expect(cameraFrameSpy).not.toHaveBeenCalled();
      expect(runtime.snapshot().tick).toBe(1);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("produces identical direct traversal evidence under different camera yaw", async () => {
    const fixture = compileFixture();
    const firstRuntime = await createRuntime(fixture.executionPlan);
    const secondRuntime = await createRuntime(fixture.executionPlan);
    try {
      const firstPort = createBabylonTraversalRuntimePortV1({
        runtime: firstRuntime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const secondPort = createBabylonTraversalRuntimePortV1({
        runtime: secondRuntime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      firstPort.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      secondPort.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      secondRuntime.adjustCameraView({ yawDeltaRadians: Math.PI / 2 });

      const first = await firstPort.runFixedTick({
        walkDirectionWorldXZ: [1, 0],
      });
      const second = await secondPort.runFixedTick({
        walkDirectionWorldXZ: [1, 0],
      });

      expect(second.subjectPositionMetersXYZ).toEqual(
        first.subjectPositionMetersXYZ,
      );
      expect(second.velocityMetersPerSecondXYZ).toEqual(
        first.velocityMetersPerSecondXYZ,
      );
      expect(second.characterSupport).toEqual(first.characterSupport);
    } finally {
      await firstRuntime.dispose();
      await secondRuntime.dispose();
    }
  }, 30_000);

  it("captures a distinct receipt for each back-to-back fixed tick", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });

      const firstPromise = port.runFixedTick({
        walkDirectionWorldXZ: [0, -1],
      });
      const secondPromise = port.runFixedTick({
        walkDirectionWorldXZ: [0, -1],
      });
      const [first, second] = await Promise.all([firstPromise, secondPromise]);

      expect(first.tick).toBe(1);
      expect(second.tick).toBe(2);
      expect(first.subjectPositionMetersXYZ[2]).toBeGreaterThan(
        second.subjectPositionMetersXYZ[2],
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("fails closed when the single fixed-tick support query fails", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      const internal = runtime[BABYLON_TRAVERSAL_RUNTIME_INTERNAL]();
      const controller = internal.readSubjectController("player")!;
      vi.spyOn(controller.physicsController, "checkSupport")
        .mockImplementationOnce(() => {
          throw new Error("native support failure");
        });

      await expect(port.runFixedTick({
        walkDirectionWorldXZ: [0, -1],
      })).rejects.toMatchObject({
        code: "TRAVERSAL_RUNTIME_UNAVAILABLE",
        message: "TRAVERSAL_RUNTIME_UNAVAILABLE",
      });
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("fails closed when a Browser fixed tick activates Motion fallback before an evidence read", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      const internal = runtime[BABYLON_TRAVERSAL_RUNTIME_INTERNAL]();
      const controller = internal.readSubjectController("player")!;
      vi.spyOn(controller.physicsController, "checkSupport")
        .mockImplementationOnce(() => {
          throw new Error("native support failure");
        });

      await runtime.runFixedInput({ actions: [], ticks: 1 });

      expectRuntimeCode(
        () => port.readLatestTickEvidence(),
        "TRAVERSAL_RUNTIME_UNAVAILABLE",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("rejects non-canonical direction and invalidates evidence after ordinary reset", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      await expect(port.runFixedTick({
        walkDirectionWorldXZ: [0.5, 0.5],
      })).rejects.toMatchObject({
        code: "TRAVERSAL_RUNTIME_WALK_DIRECTION_INVALID",
      });

      runtime.reset();
      expectRuntimeCode(
        () => port.readLatestTickEvidence(),
        "TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("fails a pending unlocked Motion selection before reset mutation or support query", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const subject = fixture.executionPlan.subjects.find(
        (candidate) => candidate.entityId === "player",
      )!;
      const fallbackMotionProfileRef =
        subject.capabilityAssembly!.fallbackMotionProfile.resourceRef;
      expect(runtime.requestMotionProfile(
        "player",
        fallbackMotionProfileRef,
      )).toBe(true);
      const controller = (runtime as unknown as {
        subjectControllersByEntityId: Map<string, {
          physicsController: { checkSupport: (...args: unknown[]) => unknown };
        }>;
      }).subjectControllersByEntityId.get("player")!;
      const supportSpy = vi.spyOn(controller.physicsController, "checkSupport");

      expectRuntimeCode(
        () => port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" }),
        "TRAVERSAL_RUNTIME_LIVE_LOCK_MISMATCH",
      );
      expect(supportSpy).not.toHaveBeenCalled();
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("fails closed when live slope state drifts from the lock", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      const controller = (runtime as unknown as {
        subjectControllersByEntityId: Map<string, {
          physicsController: { maxSlopeCosine: number };
        }>;
      }).subjectControllersByEntityId.get("player")!;
      controller.physicsController.maxSlopeCosine -= 0.1;

      expectRuntimeCode(
        () => port.readLatestTickEvidence(),
        "TRAVERSAL_RUNTIME_LIVE_LOCK_MISMATCH",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("classifies low overlapping support as ambiguous and tall support as unmatched", async () => {
    for (const [heightMeters, expectedMode] of [
      [0.1, "ambiguous"],
      [1, "unmatched"],
    ] as const) {
      const fixture = compileFixture();
      const runtime = await createRuntime(withStaticBoxAtStart(
        fixture,
        heightMeters,
      ));
      try {
        const port = createBabylonTraversalRuntimePortV1({
          runtime,
          traversalLockReceipt: fixture.traversalLockReceipt,
        });
        const evidence = port.resetToStartAnchor({
          startAnchorEntityId: "spawn-main",
        });

        expect(evidence.characterSupport.supportState).toBe("supported");
        expect(evidence.characterSupport.surfaceResolution.mode).toBe(
          expectedMode,
        );
      } finally {
        await runtime.dispose();
      }
    }
  }, 30_000);

  it("keeps terrain resolved when a nearby rotated curb misses the foot XZ column", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(
      withNearbyRotatedCurbOutsideFootColumn(fixture),
    );
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(evidence.characterSupport.supportState).toBe("supported");
      const surface = fixture.executionPlan.traversal.surfaces[0]!;
      expect(evidence.characterSupport.surfaceResolution).toEqual({
        mode: "resolved",
        traversalSurfaceId: surface.traversalSurfaceId,
        surfaceEntityId: surface.surfaceEntityId,
        colliderSubshapeId: surface.colliderSubshapeId,
        resourceRef: surface.resourceRef,
        resolvedVersion: surface.resolvedVersion,
        resourceHash: surface.resourceHash,
      });
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("uses the highest exact support hit across subshapes owned by one supporting entity", async () => {
    const fixture = compileFixture();
    const plan = withTieredStaticSupportAssertion(fixture);
    const lowOnlyPlan = {
      ...plan,
      staticColliders: plan.staticColliders.filter(
        (collider) => collider.logicalSubshapeId !== "high",
      ),
    };
    const lowOnlyError = await createRuntime(lowOnlyPlan).then(
      async (unexpectedRuntime) => {
        await unexpectedRuntime.dispose();
        return undefined;
      },
      (error) => error as unknown,
    );
    expect(isWorldRuntimeLayoutAssertionErrorV1(lowOnlyError)).toBe(true);

    const runtime = await createRuntime(plan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(evidence.characterSupport.supportState).toBe("supported");
      expect(evidence.characterSupport.surfaceResolution.mode).toBe("resolved");
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("does not clamp terrain when static support is outside terrain XZ", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(withOutsideTerrainStaticSupport(fixture));
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(evidence.characterSupport.supportState).toBe("supported");
      expect(evidence.characterSupport.surfaceResolution).toEqual({
        mode: "unmatched",
      });
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("aligns V5 Havok support with the canonical asymmetric saddle diagonal", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(withAsymmetricSaddleAtStart(fixture));
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });

      expect(evidence.characterSupport.supportState).toBe("supported");
      expect(evidence.characterSupport.sampledFootPositionMetersXYZ[1])
        .toBeCloseTo(0.3, 2);
      expect(evidence.characterSupport.surfaceResolution.mode).toBe("resolved");
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("invalidates evidence across rebind-away and rebind-back transitions", async () => {
    const fixture = compileFixture(routeWorld(createValidPackageSubjectWorld()));
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      expect(runtime.bindControl({
        controllerId: TRUSTED_DEFAULT_CONTROLLER_ID,
        expectedControlledEntityId: "player",
        controlledEntityId: "pack-animal-a",
      }).status).toBe("committed");
      expectRuntimeCode(
        () => port.readLatestTickEvidence(),
        "TRAVERSAL_RUNTIME_NOT_CONTROLLED",
      );
      expect(runtime.bindControl({
        controllerId: TRUSTED_DEFAULT_CONTROLLER_ID,
        expectedControlledEntityId: "pack-animal-a",
        controlledEntityId: "player",
      }).status).toBe("committed");
      expectRuntimeCode(
        () => port.readLatestTickEvidence(),
        "TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE",
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("performs one merged reset support query for every Subject", async () => {
    const fixture = compileFixture(routeWorld(createValidPackageSubjectWorld()));
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const controllers = (runtime as unknown as {
        subjectControllersByEntityId: Map<string, {
          physicsController: { checkSupport: (...args: unknown[]) => unknown };
        }>;
      }).subjectControllersByEntityId;
      const supportSpies = [...controllers.values()].map((controller) =>
        vi.spyOn(controller.physicsController, "checkSupport")
      );
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });

      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });

      expect(supportSpies).toHaveLength(fixture.executionPlan.subjects.length);
      for (const supportSpy of supportSpies) {
        expect(supportSpy).toHaveBeenCalledTimes(1);
      }
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("uses V5 static collider rows as the only static-body authority", async () => {
    const fixture = compileFixture();
    const plan = withStaticBoxAtStart(fixture, 0.1);
    const runtime = await createRuntime(plan);
    try {
      expect(runtime.snapshot().resources.bodies).toBe(
        1 +
          plan.staticColliders.length +
          plan.subjects.length,
      );
      const internal = runtime[BABYLON_TRAVERSAL_RUNTIME_INTERNAL]();
      const collisionMeshes = internal.readStaticCollisionMeshes();
      expect(collisionMeshes.map(({ collider }) => collider)).toEqual(
        plan.staticColliders,
      );
      for (const { collider, mesh } of collisionMeshes) {
        const local = emitStaticColliderTriangleMeshV1(collider.shape);
        expect(mesh.getVerticesData(VertexBuffer.PositionKind)).toEqual(
          [...local.localPositionsMetersXYZ],
        );
        expect(mesh.getIndices()).toEqual([...local.triangleIndices]);
        expect([mesh.position.x, mesh.position.y, mesh.position.z]).toEqual(
          collider.transform.positionMetersXYZ,
        );
        expect([mesh.scaling.x, mesh.scaling.y, mesh.scaling.z]).toEqual(
          collider.transform.scaleXYZ,
        );
      }
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("fails closed after Runtime disposal", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(fixture.executionPlan);
    const port = createBabylonTraversalRuntimePortV1({
      runtime,
      traversalLockReceipt: fixture.traversalLockReceipt,
    });
    port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });

    await runtime.dispose();

    expectRuntimeCode(
      () => port.readLatestTickEvidence(),
      "TRAVERSAL_RUNTIME_UNAVAILABLE",
    );
  }, 30_000);
});
