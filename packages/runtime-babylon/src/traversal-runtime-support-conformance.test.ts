import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { PhysicsCharacterController } from "@babylonjs/core/Physics/v2/characterController.js";
import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import {
  compileResolvedTraversalLockV1,
  compileCanonicalWorldV1,
} from "@whitebox-world/compiler";
import {
  createGameplayBootstrapV1,
  RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
} from "@whitebox-world/gameplay-contracts";
import type { CanonicalSceneExecutionPlanV1 } from "@whitebox-world/runtime-contracts";
import type {
  ResolvedTraversalLockReceiptV1,
  TraversalRuntimeTickEvidenceV1,
} from "@whitebox-world/traversal";
import { describe, expect, it, vi } from "vitest";

import {
  createValidAuthoringSpec,
  createValidPackageSubjectWorld,
} from "@whitebox-world/authoring/testing";
import { BabylonWorldRuntime } from "./babylon-world-runtime";
import { readCharacterMovementNativeDriverForTestingV1 } from "./babylon-character-body-port.testing";
import type { CharacterMovementSubjectControllerV1 } from "./character-movement-component";
import { BABYLON_GAMEPLAY_RUNTIME_INTERNAL } from "./gameplay-runtime-internal";
import { bindRuntimeTestPossession } from "./runtime-test-possession";
import { createBabylonTraversalRuntimePortV1 } from "./traversal-runtime-port";
import { BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1 } from "./traversal-implementation-identity";
import {
  createRuntimeTestWorldVariantV1,
  registerRuntimeTestWorldArtifactsV1,
  runtimeTestSubjectsForPlanV1,
  runtimeTestWorldArtifactsForPlanV1,
  runtimeTestWorldInputForPlanV1,
} from "./runtime-test-plan";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve(
    "@babylonjs/havok/lib/esm/HavokPhysics.wasm",
  ),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;
const GAMEPLAY_BOOTSTRAP = createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: "traversal-runtime-support-conformance-test.gameplay",
    version: 1,
    resourceRef:
      "worldkit://gameplay-bootstrap/traversal-runtime-support-conformance-test@1",
    semanticFactProjectorProfileResource:
      RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
    entityDescriptors: [],
    featureResourceLocks: [],
    semanticActionDefinitions: [],
    availableCapabilityRefs: [],
    initialRelationshipStates: [],
  });

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
  executionPlan: CanonicalSceneExecutionPlanV1;
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
  const compiled = compileCanonicalWorldV1({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrap: GAMEPLAY_BOOTSTRAP,
    worldRuntimeBootstrapRef:
      `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
  });
  if (!compiled.ok || compiled.canonicalSceneExecutionPlan === undefined) {
    throw new Error("Route fixture compilation failed.");
  }
  registerRuntimeTestWorldArtifactsV1({
    executionPlan: compiled.canonicalSceneExecutionPlan,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
    gameplayBootstrap: GAMEPLAY_BOOTSTRAP,
  });
  return {
    normalizedWorldIr: normalized.value,
    executionPlan: compiled.canonicalSceneExecutionPlan,
    traversalLockReceipt: compileResolvedTraversalLockV1({
      normalizedWorldIr: normalized.value,
      canonicalSceneExecutionPlan: compiled.canonicalSceneExecutionPlan,
      worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
      traversingEntityId: "player",
      runtimeImplementationIdentity:
        BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
    }),
  };
}


function withBoundStaticBoxAtStart(
  fixture: ReturnType<typeof compileFixture>,
  heightMeters: number,
): CanonicalSceneExecutionPlanV1 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
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
  const boundSurface = {
    kind: "static-collider" as const,
    traversalSurfaceId: `traversal-surface:${supportCollider.entityId}:primary`,
    surfaceEntityId: supportCollider.entityId,
    colliderSubshapeId: supportCollider.colliderSubshapeId,
    resourceRef: `package://traversal-surface/${supportCollider.entityId}.primary@1`,
    resolvedVersion: "1",
    resourceHash: `sha256:${"a".repeat(64)}` as const,
    logicalSurfaceId: "primary",
    logicalSubshapeId: supportCollider.logicalSubshapeId,
    colliderHash: supportCollider.colliderHash,
    traversalSurfaceProfileRef:
      "worldkit://traversal-surface-profile/ground.static@1",
    traversalSurfaceProfileResolvedVersion: "1",
    traversalSurfaceProfileHash: `sha256:${"b".repeat(64)}` as const,
  };
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
            positionMetersXYZ: [
              placement.transform.positionMetersXYZ[0],
              heightMeters,
              placement.transform.positionMetersXYZ[2],
            ],
          },
        },
      },
    },
    staticColliders: [...plan.staticColliders, supportCollider],
    traversal: {
      ...plan.traversal,
      surfaces: [...plan.traversal.surfaces, boundSurface],
    },
  };
}

function withSteepRampAtStart(
  fixture: ReturnType<typeof compileFixture>,
): CanonicalSceneExecutionPlanV1 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
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
            positionMetersXYZ: [0.4, 3, 30],
          },
        },
      },
    },
    staticColliders: [
      ...plan.staticColliders,
      {
        entityId: "steep-ramp",
        logicalSubshapeId: "primary",
        colliderSubshapeId: "collider:steep-ramp:primary",
        colliderHash: `sha256:${"c".repeat(64)}`,
        transform: {
          positionMetersXYZ: [0, 2.4, 30],
          rotationEulerRadiansXYZ: [0, 0, -0.9],
          scaleXYZ: [1, 1, 1],
        },
        shape: {
          kind: "box",
          sizeMetersXYZ: [4, 1, 4],
        },
      },
    ],
  };
}

function withEverySubjectAirborne(
  fixture: ReturnType<typeof compileFixture>,
): CanonicalSceneExecutionPlanV1 {
  const plan = fixture.executionPlan;
  const startPlacement = plan.layout.placementsByEntityId["spawn-main"]!;
  return createRuntimeTestWorldVariantV1(plan, {
    runtimeSubjects: runtimeTestSubjectsForPlanV1(plan).map((subject) => ({
      ...subject,
      spawnSubjectOriginPositionMetersXYZ: [
        subject.spawnSubjectOriginPositionMetersXYZ[0],
        2,
        subject.spawnSubjectOriginPositionMetersXYZ[2],
      ],
    })),
    scenePlanPatch: {
      layout: {
        ...plan.layout,
        layoutAssertions: [],
        placementsByEntityId: {
          ...plan.layout.placementsByEntityId,
          "spawn-main": {
            ...startPlacement,
            transform: {
              ...startPlacement.transform,
              positionMetersXYZ: [
                startPlacement.transform.positionMetersXYZ[0],
                2,
                startPlacement.transform.positionMetersXYZ[2],
              ],
            },
          },
        },
      },
    },
  });
}

async function createRuntime(
  executionPlan: CanonicalSceneExecutionPlanV1,
): Promise<BabylonWorldRuntime> {
  const runtime = await BabylonWorldRuntime.create({
    ...runtimeTestWorldInputForPlanV1(executionPlan),
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
  await bindRuntimeTestPossession(
    runtime,
    runtimeTestWorldArtifactsForPlanV1(executionPlan).worldRuntimeBootstrap
      .initialControlledEntityId,
  );
  runtime.publishInitialBoundCameraView(
    runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL]().readViewProjection()
      .viewStateRevision,
  );
  return runtime;
}

function controllerFor(
  runtime: BabylonWorldRuntime,
  entityId: string,
): CharacterMovementSubjectControllerV1 {
  const character = (runtime as unknown as {
    characterEntitiesByEntityId: Map<string, {
      movement: CharacterMovementSubjectControllerV1;
    }>;
  }).characterEntitiesByEntityId.get(entityId);
  if (character === undefined) {
    throw new Error(`Missing Character Entity '${entityId}'.`);
  }
  return character.movement;
}

function nativeDriverFor(runtime: BabylonWorldRuntime, entityId: string) {
  return readCharacterMovementNativeDriverForTestingV1(
    controllerFor(runtime, entityId),
  );
}

describe("Traversal runtime support conformance", () => {
  it("publishes initialization support from exactly one BodyPort query", async () => {
    const fixture = compileFixture();
    const supportSpy = vi.spyOn(
      PhysicsCharacterController.prototype,
      "checkSupport",
    );
    let runtime: BabylonWorldRuntime | undefined;
    try {
      runtime = await createRuntime(fixture.executionPlan);

      expect(supportSpy).toHaveBeenCalledTimes(1);
      expect(
        controllerFor(runtime, "player").retainedCharacterSupportSample(),
      ).toMatchObject({ supportState: "supported" });
      expect(runtime.snapshot().subjectStatesByEntityId.player).toMatchObject({
        movementMedium: "ground",
        locomotionMode: "idle",
      });
    } finally {
      await runtime?.dispose();
      supportSpy.mockRestore();
    }
  }, 30_000);

  it("uses one support query for a sliding tick and publishes that query as Evidence", async () => {
    const fixture = compileFixture();
    const runtime = await createRuntime(withSteepRampAtStart(fixture));
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      const supportSpy = vi.spyOn(
        nativeDriverFor(runtime, "player"),
        "checkSupport",
      );
      let slidingEvidence: TraversalRuntimeTickEvidenceV1 | undefined;

      for (let tick = 0; tick < 120; tick += 1) {
        supportSpy.mockClear();
        const evidence = await port.runFixedTick({
          walkDirectionWorldXZ: [0, 0],
        });
        expect(supportSpy).toHaveBeenCalledTimes(1);
        if (evidence.characterSupport.supportState === "sliding") {
          const queriedSupport = supportSpy.mock.results[0]!.value;
          expect(evidence.characterSupport.supportNormalWorldXYZ).toEqual(
            queriedSupport.averageSurfaceNormalXYZ,
          );
          expect(evidence.characterSupport.isSupportSurfaceDynamic).toBe(
            queriedSupport.isSurfaceDynamic,
          );
          slidingEvidence = evidence;
          break;
        }
      }

      expect(slidingEvidence).toMatchObject({
        kind: "traversal-runtime-tick-evidence",
        movementMedium: "ground",
        characterSupport: {
          kind: "character-support-evidence",
          supportState: "sliding",
          surfaceResolution: { mode: "unmatched" },
        },
      });
      expect(Object.isFrozen(slidingEvidence)).toBe(true);
      expect(Object.isFrozen(slidingEvidence!.characterSupport)).toBe(true);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("uses one support query for each uncontrolled grounded Subject and publishes public state", async () => {
    const fixture = compileFixture(routeWorld(createValidPackageSubjectWorld()));
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
      const controlledSupportSpy = vi.spyOn(
        nativeDriverFor(runtime, "player"),
        "checkSupport",
      );
      const uncontrolledSupportSpies = ["pack-animal-a", "pack-animal-b"].map(
        (entityId) => vi.spyOn(
          nativeDriverFor(runtime, entityId),
          "checkSupport",
        ),
      );

      const evidence = await port.runFixedTick({
        walkDirectionWorldXZ: [0, 0],
      });
      const snapshot = runtime.snapshot();

      expect(controlledSupportSpy).toHaveBeenCalledTimes(1);
      for (const supportSpy of uncontrolledSupportSpies) {
        expect(supportSpy).toHaveBeenCalledTimes(1);
      }
      expect(evidence).toMatchObject({
        tick: 1,
        movementMedium: "ground",
        characterSupport: { supportState: "supported" },
      });
      for (const entityId of ["pack-animal-a", "pack-animal-b"] as const) {
        expect(snapshot.subjectStatesByEntityId[entityId]).toMatchObject({
          movementMedium: "ground",
          locomotionMode: "idle",
        });
      }
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("uses exactly one support query per Subject during an ordinary runtime reset", async () => {
    const fixture = compileFixture(routeWorld(createValidPackageSubjectWorld()));
    const runtime = await createRuntime(fixture.executionPlan);
    try {
      const supportSpies = runtimeTestSubjectsForPlanV1(fixture.executionPlan).map((subject) => ({
        entityId: subject.entityId,
        spy: vi.spyOn(
          nativeDriverFor(runtime, subject.entityId),
          "checkSupport",
        ),
      }));

      const snapshot = runtime.reset();

      expect(snapshot.tick).toBe(0);
      for (const { entityId, spy } of supportSpies) {
        expect(spy, entityId).toHaveBeenCalledTimes(1);
        expect(snapshot.subjectStatesByEntityId[entityId]).toMatchObject({
          movementMedium: "ground",
          locomotionMode: "idle",
        });
      }
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("uses exactly one support query per Subject for a successful unsupported traversal tick", async () => {
    const fixture = compileFixture(routeWorld(createValidPackageSubjectWorld()));
    const runtime = await createRuntime(withEverySubjectAirborne(fixture));
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const resetEvidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      expect(resetEvidence.characterSupport).toMatchObject({
        supportState: "unsupported",
        surfaceResolution: { mode: "unsupported" },
      });
      const supportSpies = runtimeTestSubjectsForPlanV1(fixture.executionPlan).map((subject) => ({
        entityId: subject.entityId,
        spy: vi.spyOn(
          nativeDriverFor(runtime, subject.entityId),
          "checkSupport",
        ),
      }));

      const evidence = await port.runFixedTick({
        walkDirectionWorldXZ: [0, 0],
      });
      const snapshot = runtime.snapshot();

      expect(evidence).toMatchObject({
        tick: 1,
        movementMedium: "air",
        locomotionMode: "airborne",
        characterSupport: {
          supportState: "unsupported",
          surfaceResolution: { mode: "unsupported" },
        },
      });
      for (const { entityId, spy } of supportSpies) {
        expect(spy, entityId).toHaveBeenCalledTimes(1);
        expect(snapshot.subjectStatesByEntityId[entityId]).toMatchObject({
          movementMedium: "air",
          locomotionMode: "airborne",
        });
      }
    } finally {
      await runtime.dispose();
    }
  }, 30_000);


  it("resolves a bound static platform from one checkSupport query", async () => {
    const fixture = compileFixture();
    const plan = withBoundStaticBoxAtStart(fixture, 1);
    const runtime = await createRuntime(plan);
    try {
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt: fixture.traversalLockReceipt,
      });
      const supportSpy = vi.spyOn(
        nativeDriverFor(runtime, "player"),
        "checkSupport",
      );
      const evidence = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      const bound = plan.traversal.surfaces.find(
        (surface) => surface.kind === "static-collider",
      )!;
      expect(supportSpy).toHaveBeenCalledTimes(1);
      expect(evidence.characterSupport.supportState).toBe("supported");
      expect(evidence.characterSupport.surfaceResolution).toMatchObject({
        mode: "resolved",
        traversalSurfaceId: bound.traversalSurfaceId,
        surfaceEntityId: bound.surfaceEntityId,
        colliderSubshapeId: bound.colliderSubshapeId,
      });
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it.each(["Feel", "capsule", "step"] as const)(
    "fails closed before a support query when live %s state drifts",
    async (driftKind) => {
      const fixture = compileFixture();
      const runtime = await createRuntime(fixture.executionPlan);
      try {
        const port = createBabylonTraversalRuntimePortV1({
          runtime,
          traversalLockReceipt: fixture.traversalLockReceipt,
        });
        port.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
        const controller = controllerFor(runtime, "player");
        const supportSpy = vi.spyOn(
          nativeDriverFor(runtime, "player"),
          "checkSupport",
        );
        const liveLock = controller.liveLockState();
        vi.spyOn(controller, "liveLockState").mockReturnValue(
          driftKind === "Feel"
            ? {
                ...liveLock,
                controlFeelProfileRef:
                  "worldkit://control-feel-profile/humanoid.heavy-ground@1",
                requestedControlFeelProfileRef:
                  "worldkit://control-feel-profile/humanoid.heavy-ground@1",
              }
            : driftKind === "capsule"
              ? {
                  ...liveLock,
                  capsuleRadiusMeters: liveLock.capsuleRadiusMeters + 0.01,
                }
              : {
                  ...liveLock,
                  maxStepHeightMeters: liveLock.maxStepHeightMeters + 0.01,
                },
        );
        supportSpy.mockClear();

        await expect(port.runFixedTick({
          walkDirectionWorldXZ: [0, 0],
        })).rejects.toMatchObject({
          code: "TRAVERSAL_RUNTIME_LIVE_LOCK_MISMATCH",
          message: "TRAVERSAL_RUNTIME_LIVE_LOCK_MISMATCH",
        });
        expect(supportSpy).not.toHaveBeenCalled();
      } finally {
        await runtime.dispose();
      }
    },
    30_000,
  );
});
