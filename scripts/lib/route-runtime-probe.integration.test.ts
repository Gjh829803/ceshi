import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import {
  compileResolvedTraversalLockV1,
  compileCanonicalWorldV1,
} from "@whitebox-world/compiler";
import {
  createGameplayBootstrapV1,
  RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
} from "@whitebox-world/gameplay-contracts";
import {
  BabylonWorldRuntime,
  BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
  createBabylonTraversalRuntimePortV1,
} from "@whitebox-world/runtime-babylon";
import type {
  CanonicalSceneExecutionPlanV1,
  WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
  canonicalRoutePathReceiptV2,
  createTraversalCapabilityEnvelopeV1,
  deriveColliderSubshapeIdV1,
  hashRouteRuntimeProbeReceiptV2,
  resolveTraversalDriverProfileV1,
  resolveTraversalGraphBuilderProfileV2,
  type ResolvedTraversalLockReceiptV1,
  type RoutePathReceiptV2,
  type RouteRuntimeProbeReceiptV2,
  type TraversalRuntimePortV1,
  type TraversalRuntimeTickEvidenceV1,
} from "@whitebox-world/traversal";
import {
  createRouteBuildInputFromPlanV2,
  evaluateRequiredRouteV2,
} from "@whitebox-world/traversal-recast";
import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
  runRouteRuntimeProbeV2,
} from "@whitebox-world/validation";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEqual, isNil } from "lodash-es";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createValidAuthoringSpec } from "../../packages/authoring/src/test-fixture.js";
import { bindRuntimeTestPossession } from "../../packages/runtime-babylon/src/runtime-test-possession.js";
import { readCharacterMovementNativeDriverForTestingV1 } from "../../packages/runtime-babylon/src/babylon-character-body-port.testing.js";
import type { CharacterMovementSubjectControllerV1 } from "../../packages/runtime-babylon/src/character-movement-component.js";

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
    id: "route-runtime-probe-test.gameplay",
    version: 1,
    resourceRef: "worldkit://gameplay-bootstrap/route-runtime-probe-test@1",
    semanticFactProjectorProfileResource:
      RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
    entityDescriptors: [],
    featureResourceLocks: [],
    semanticActionDefinitions: [],
    availableCapabilityRefs: [],
    initialRelationshipStates: [],
  });

interface RealRouteFixture {
  readonly executionPlan: CanonicalSceneExecutionPlanV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly traversalLockReceipt: ResolvedTraversalLockReceiptV1;
  readonly routePathReceipt: RoutePathReceiptV2;
}

interface CreateRouteAuthoringSpecOptions {
  readonly startX?: number;
  readonly goalX?: number;
  readonly routeWidthMeters?: number;
}

function createRouteAuthoringSpec(
  options: CreateRouteAuthoringSpecOptions = {},
): AuthoringSpecV4 {
  const source = createValidAuthoringSpec();
  const startX = options.startX ?? 0;
  const goalX = options.goalX ?? startX;
  const routeWidthMeters = options.routeWidthMeters ?? 4;
  const nodes: AuthoringSpecV4["nodes"][number][] = source.nodes
    .filter((node) => node.kind !== "water" && node.kind !== "object")
    .map((node): AuthoringSpecV4["nodes"][number] => {
      if (node.kind === "terrain") {
        return {
          ...node,
          components: {
            terrain: {
              ...node.components.terrain,
              source: {
                kind: "procedural",
                relief: "flat",
                baseHeightMeters: 0,
                amplitudeMeters: 0,
              },
              grid: {
                centerMetersXZ: [0, 0],
                sizeMetersXZ: [20, 20],
                resolutionCellsXZ: [17, 17],
              },
            },
          },
        };
      }
      if (node.id === "spawn-main" && node.kind === "anchor") {
        return {
          ...node,
          placement: {
            kind: "fixed",
            transform: { positionMetersXYZ: [startX, 0, 4] },
          },
        };
      }
      return node;
    });
  return {
    ...source,
    schemaVersion: 4,
    world: {
      ...source.world,
      bounds: {
        centerMetersXZ: [0, 0],
        sizeMetersXZ: [20, 20],
        heightRangeMeters: [-5, 10],
      },
    },
    spatial: {
      ...source.spatial,
      traversalAreas: [],
      routes: [{
        id: "main-route",
        kind: "polyline-xz",
        pointsMetersXZ: [[0, 4], [0, -4]],
        widthMeters: routeWidthMeters,
        locomotionProfileRef:
          "worldkit://locomotion-profile/ground.standard@1",
      }],
    },
    nodes: [
      ...nodes,
      {
        id: "goal",
        kind: "anchor" as const,
        placement: {
          kind: "fixed" as const,
          transform: { positionMetersXYZ: [goalX, 0, -4] as const },
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

async function prepareRealRouteFixture(
  spec = createRouteAuthoringSpec(),
): Promise<RealRouteFixture> {
  const normalized = normalizeAuthoringSpecV4(spec);
  if (
    !normalized.ok ||
    isNil(normalized.value) ||
    isNil(normalized.normalizedWorldIrHash)
  ) {
    throw new Error(`Route fixture normalization failed: ${JSON.stringify(normalized.diagnostics)}`);
  }
  const compiled = compileCanonicalWorldV1({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrap: GAMEPLAY_BOOTSTRAP,
    worldRuntimeBootstrapRef:
      `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
  });
  if (!compiled.ok || isNil(compiled.canonicalSceneExecutionPlan)) {
    throw new Error(`Route fixture compilation failed: ${JSON.stringify(compiled.diagnostics)}`);
  }
  const traversalLockReceipt = compileResolvedTraversalLockV1({
    normalizedWorldIr: normalized.value,
    canonicalSceneExecutionPlan: compiled.canonicalSceneExecutionPlan,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
    traversingEntityId: "player",
    runtimeImplementationIdentity:
      BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
  });
  const graphBuilderProfile = resolveTraversalGraphBuilderProfileV2(
    BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  );
  const capabilityEnvelope = createTraversalCapabilityEnvelopeV1({
    traversalLockReceipt,
    graphBuilderProfile,
  });
  const buildInputReceipt = createRouteBuildInputFromPlanV2({
    executionPlan: compiled.canonicalSceneExecutionPlan,
    capabilityEnvelope: capabilityEnvelope.envelope,
    traversalLockReceipt,
    constraintId: "hero-to-goal",
  });
  const routeResult = await evaluateRequiredRouteV2({
    buildInputReceipt,
  });
  if (routeResult.status !== "complete") {
    throw new Error(`Real Recast route fixture was not complete: ${JSON.stringify(routeResult)}`);
  }
  return {
    executionPlan: compiled.canonicalSceneExecutionPlan,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
    traversalLockReceipt,
    routePathReceipt: routeResult.routePathReceipt,
  };
}

async function createRuntimeHarness(
  fixture: RealRouteFixture,
  runtimeSessionId: string,
  executionPlan: CanonicalSceneExecutionPlanV1 = fixture.executionPlan,
) {
  let engine: NullEngine | undefined;
  const runtime = await BabylonWorldRuntime.create({
    sceneSource: { kind: "canonical-execution-plan", executionPlan },
    worldRuntimeBootstrap: fixture.worldRuntimeBootstrap,
    gameplayBootstrap: GAMEPLAY_BOOTSTRAP,
    runtimeSessionId,
    havokWasmBinary,
    autoStartRenderLoop: false,
    engineFactory: () => {
      engine = new NullEngine({
        renderWidth: 320,
        renderHeight: 180,
        textureSize: 256,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      });
      return engine;
    },
  });
  try {
    if (isNil(engine)) throw new Error("NullEngine was not created.");
    const initialCameraViewRevision = await bindRuntimeTestPossession(
      runtime,
      fixture.traversalLockReceipt.lock.subjectEntityId,
    );
    runtime.publishInitialBoundCameraView(
      initialCameraViewRevision,
    );
    const port = createBabylonTraversalRuntimePortV1({
      runtime,
      traversalLockReceipt: fixture.traversalLockReceipt,
    });
    return { engine, runtime, port };
  } catch (error) {
    try {
      await runtime.dispose();
    } catch {
      // Preserve the acquisition failure; Runtime owns best-effort cleanup.
    }
    throw error;
  }
}

async function acquireRuntimeHarnessPair<T>(
  acquireFirst: () => Promise<T>,
  acquireSecond: () => Promise<T>,
  release: (resource: T) => Promise<void>,
): Promise<readonly [T, T]> {
  const first = await acquireFirst();
  try {
    const second = await acquireSecond();
    return [first, second];
  } catch (error) {
    try {
      await release(first);
    } catch {
      // Preserve the second acquisition failure after best-effort unwind.
    }
    throw error;
  }
}

function staticBoxCollider(input: Readonly<{
  entityId: string;
  positionMetersXYZ: readonly [number, number, number];
  sizeMetersXYZ: readonly [number, number, number];
}>) {
  const colliderSubshapeId = deriveColliderSubshapeIdV1(
    input.entityId,
    "primary",
  );
  const shape = {
    kind: "box" as const,
    sizeMetersXYZ: input.sizeMetersXYZ,
  };
  const transform = {
    positionMetersXYZ: input.positionMetersXYZ,
    rotationEulerRadiansXYZ: [0, 0, 0] as const,
    scaleXYZ: [1, 1, 1] as const,
  };
  return {
    entityId: input.entityId,
    logicalSubshapeId: "primary",
    colliderSubshapeId,
    colliderHash: sha256CanonicalJson({
      entityId: input.entityId,
      logicalSubshapeId: "primary",
      colliderSubshapeId,
      transform,
      shape,
    }) as `sha256:${string}`,
    transform,
    shape,
  };
}

function withBlockingWall(fixture: RealRouteFixture): CanonicalSceneExecutionPlanV1 {
  return {
    ...fixture.executionPlan,
    staticColliders: [
      ...fixture.executionPlan.staticColliders,
      staticBoxCollider({
        entityId: "route-wall",
        positionMetersXYZ: [0, 2, 0],
        sizeMetersXYZ: [10, 4, 1],
      }),
    ],
  };
}

function withStaticSupportAtStart(
  fixture: RealRouteFixture,
  heightMeters: number,
): CanonicalSceneExecutionPlanV1 {
  const plan = structuredClone(fixture.executionPlan);
  const placement = plan.layout.placementsByEntityId["spawn-main"]!;
  const [x, , z] = placement.transform.positionMetersXYZ;
  return {
    ...plan,
    layout: {
      ...plan.layout,
      placementsByEntityId: {
        ...plan.layout.placementsByEntityId,
        "spawn-main": {
          ...placement,
          transform: {
            ...placement.transform,
            positionMetersXYZ: [x, heightMeters, z],
          },
        },
      },
    },
    staticColliders: [
      ...plan.staticColliders,
      staticBoxCollider({
        entityId: "start-pedestal",
        positionMetersXYZ: [x, heightMeters / 2, z],
        sizeMetersXYZ: [2, heightMeters, 2],
      }),
    ],
  };
}

function pathWithWrongResolvedSurface(
  fixture: RealRouteFixture,
): RoutePathReceiptV2 {
  const forgedIdentity = {
    ...fixture.routePathReceipt.orderedTraversalSurfaceIdentities[0],
    traversalSurfaceId: "forged-surface",
    surfaceEntityId: "forged-terrain",
    colliderSubshapeId: "forged-collider",
    resourceRef: "package://traversal-surface/forged.heightfield@1",
    resourceHash: `sha256:${"f".repeat(64)}`,
  };
  return canonicalRoutePathReceiptV2({
    ...fixture.routePathReceipt,
    orderedTraversalSurfaceIdentities:
      fixture.routePathReceipt.orderedTraversalSurfaceIdentities.map(
        () => forgedIdentity,
      ),
  });
}

interface TraversalPortHooks {
  readonly afterReset?: (evidence: TraversalRuntimeTickEvidenceV1) => void;
  readonly afterTick?: (evidence: TraversalRuntimeTickEvidenceV1) => void;
}

function wrapTraversalPort(
  port: TraversalRuntimePortV1,
  hooks: TraversalPortHooks,
): TraversalRuntimePortV1 {
  return {
    kind: port.kind,
    schemaVersion: port.schemaVersion,
    traversingEntityId: port.traversingEntityId,
    authoringSpecHash: port.authoringSpecHash,
    layoutSolveReportHash: port.layoutSolveReportHash,
    resourceLockHash: port.resourceLockHash,
    executionPlanHash: port.executionPlanHash,
    resolvedTraversalLockHash: port.resolvedTraversalLockHash,
    runtimeImplementationIdentity: port.runtimeImplementationIdentity,
    readLatestTickEvidence: () => port.readLatestTickEvidence(),
    resetToStartAnchor: (request) => {
      const evidence = port.resetToStartAnchor(request);
      hooks.afterReset?.(evidence);
      return evidence;
    },
    runFixedTick: async (request) => {
      const evidence = await port.runFixedTick(request);
      hooks.afterTick?.(evidence);
      return evidence;
    },
  };
}

function runtimeLedger(harness: Awaited<ReturnType<typeof createRuntimeHarness>>) {
  const internals = harness.runtime as unknown as {
    characterEntitiesByEntityId: ReadonlyMap<string, unknown>;
  };
  const scene = harness.engine.scenes[0];
  if (isNil(scene)) throw new Error("Runtime Scene was not created.");
  return {
    resources: structuredClone(harness.runtime.snapshot().resources),
    controllerCount: internals.characterEntitiesByEntityId.size,
    listenerCounts: {
      beforeRender: scene.onBeforeRenderObservable.observers.length,
      afterRender: scene.onAfterRenderObservable.observers.length,
      beforeAnimations: scene.onBeforeAnimationsObservable.observers.length,
    },
  };
}

const FORBIDDEN_PROVIDER_HANDLE_KEYS = new Set([
  "babylonHandle",
  "havokBodyHandle",
  "nativeHandle",
  "physicsBodyHandle",
  "providerHandle",
  "providerPolygonRef",
  "wasmPointer",
]);

function findForbiddenProviderHandleKeys(
  value: unknown,
  found = new Set<string>(),
): ReadonlySet<string> {
  if (Array.isArray(value)) {
    for (const item of value) findForbiddenProviderHandleKeys(item, found);
    return found;
  }
  if (isNil(value) || typeof value !== "object") return found;
  for (const [key, nestedValue] of Object.entries(value)) {
    if (FORBIDDEN_PROVIDER_HANDLE_KEYS.has(key)) found.add(key);
    findForbiddenProviderHandleKeys(nestedValue, found);
  }
  return found;
}

async function runProbe(
  fixture: RealRouteFixture,
  runtimePort: TraversalRuntimePortV1,
  routePathReceipt: RoutePathReceiptV2 = fixture.routePathReceipt,
): Promise<RouteRuntimeProbeReceiptV2> {
  return runRouteRuntimeProbeV2({
    routePathReceipt,
    traversalDriverProfile: resolveTraversalDriverProfileV1(
      BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
    ),
    runtimePort,
    validationProfile: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
    resolvedControlFeelProfile: { walkSpeedMetersPerSecond: 4 },
    positionQuantizationMeters:
      resolveTraversalGraphBuilderProfileV2(
        BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
      ).profile.positionQuantizationMeters,
  });
}

describe("Route R1 fixed-tick probe with real Recast and Babylon/Havok", () => {
  let fixture: RealRouteFixture;

  beforeAll(async () => {
    fixture = await prepareRealRouteFixture();
  }, 60_000);

  it("completes a continuous Heightfield route without teleporting", async () => {
    const harness = await createRuntimeHarness(fixture, "route-probe-continuous");
    try {
      const internals = harness.runtime as unknown as {
        characterEntitiesByEntityId: ReadonlyMap<string, {
          movement: CharacterMovementSubjectControllerV1;
        }>;
      };
      const character = internals.characterEntitiesByEntityId.get("player");
      if (isNil(character)) throw new Error("Player character was not created.");
      const checkSupport = vi.spyOn(
        readCharacterMovementNativeDriverForTestingV1(character.movement),
        "checkSupport",
      );
      const receipt = await runProbe(fixture, harness.port);

      expect(receipt.status).toBe("complete");
      if (receipt.status !== "complete") return;
      expect(receipt.initialRuntimeEvidence.tick).toBe(0);
      expect(receipt.ticks.map((tick) => tick.probeTick)).toEqual(
        Array.from({ length: receipt.metrics.processedTickCount }, (_, index) => index + 1),
      );
      expect(checkSupport).toHaveBeenCalledTimes(
        1 + receipt.metrics.processedTickCount,
      );
      expect(receipt.ticks.every((tick) =>
        tick.runtimeEvidence.characterSupport.surfaceResolution.mode === "resolved" &&
        isEqual(tick.runtimeEvidence.characterSupport.surfaceResolution, {
          mode: "resolved",
          ...fixture.routePathReceipt.orderedTraversalSurfaceIdentities[0],
        })
      )).toBe(true);
      const positions = [
        receipt.initialRuntimeEvidence.subjectPositionMetersXYZ,
        ...receipt.ticks.map((tick) => tick.runtimeEvidence.subjectPositionMetersXYZ),
      ];
      for (let index = 1; index < positions.length; index += 1) {
        expect(Math.hypot(
          positions[index]![0] - positions[index - 1]![0],
          positions[index]![1] - positions[index - 1]![1],
          positions[index]![2] - positions[index - 1]![2],
        )).toBeLessThan(0.2);
      }
      expect(receipt.completionDurationTicks).toBe(receipt.metrics.processedTickCount);
      expect(hashRouteRuntimeProbeReceiptV2(receipt)).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect([...findForbiddenProviderHandleKeys(receipt)]).toEqual([]);
    } finally {
      await harness.runtime.dispose();
    }
  }, 60_000);

  it("fails on a real wall even when the test deliberately reuses forged passing graph evidence", async () => {
    const planWithWall = withBlockingWall(fixture);
    const harness = await createRuntimeHarness(
      fixture,
      "route-probe-wall",
      planWithWall,
    );
    try {
      const receipt = await runProbe(fixture, harness.port);

      expect(receipt.status).toBe("failed");
      if (receipt.status !== "failed") return;
      expect(receipt.failure).toMatchObject({
        kind: "runtime-stalled",
        stalledDurationTicks:
          OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2
            .routeRuntimeGateThresholds.stalledWindowTicks + 1,
      });
      expect(receipt.metrics.wrongSupportSurfaceCount).toBe(0);
      expect(harness.runtime.snapshot().resources.bodies).toBe(
        fixture.executionPlan.staticColliders.length +
          fixture.worldRuntimeBootstrap.subjectRuntimeDescriptors.length +
          2,
      );
    } finally {
      await harness.runtime.dispose();
    }
  }, 60_000);

  it("records real support loss after test-owned terrain support is withdrawn", async () => {
    const harness = await createRuntimeHarness(fixture, "route-probe-fall");
    try {
      const internals = harness.runtime as unknown as {
        aggregates: Array<{
          transformNode: {
            metadata?: { worldkitEntityId?: unknown } | null;
          };
          dispose(): void;
        }>;
      };
      const terrainAggregate = internals.aggregates.find(
        (aggregate) =>
          aggregate.transformNode.metadata?.worldkitEntityId ===
            fixture.executionPlan.terrain.entityId,
      );
      if (isNil(terrainAggregate)) {
        throw new Error("Runtime did not create the terrain PhysicsAggregate.");
      }
      const bodyCountBeforeWithdrawal = harness.runtime.snapshot().resources.bodies;
      const character = (harness.runtime as unknown as {
        characterEntitiesByEntityId: ReadonlyMap<string, {
          movement: CharacterMovementSubjectControllerV1;
        }>;
      }).characterEntitiesByEntityId.get("player");
      if (isNil(character)) throw new Error("Player character was not created.");
      const checkSupport = vi.spyOn(
        readCharacterMovementNativeDriverForTestingV1(character.movement),
        "checkSupport",
      );
      const port = wrapTraversalPort(harness.port, {
        afterReset: (evidence) => {
          expect(evidence.characterSupport.supportState).toBe("supported");
          expect(evidence.characterSupport.surfaceResolution.mode).toBe("resolved");
          // Test-only real-physics fault injection: walking beyond the authored
          // surface bounds correctly fails as a surface mismatch first, so remove
          // this fixture-owned support body to exercise Havok support loss itself.
          terrainAggregate.dispose();
        },
      });
      const receipt = await runProbe(fixture, port);

      expect(receipt.status).toBe("failed");
      if (receipt.status !== "failed") return;
      expect(receipt.initialRuntimeEvidence.characterSupport.supportState).not.toBe(
        "unsupported",
      );
      expect(receipt.failure).toMatchObject({
        kind: "runtime-support-lost",
        consecutiveUnexpectedUnsupportedTicks:
          OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2
            .routeRuntimeGateThresholds.maximumConsecutiveUnsupportedTicks + 1,
      });
      const firstUnsupportedIndex = receipt.ticks.findIndex(
        (tick) => tick.runtimeEvidence.characterSupport.supportState === "unsupported",
      );
      expect(firstUnsupportedIndex).toBe(0);
      expect(receipt.ticks.every(
        (tick) => tick.runtimeEvidence.characterSupport.supportState === "unsupported",
      )).toBe(true);
      expect(receipt.metrics.unexpectedSupportLossCount).toBe(1);
      expect(checkSupport).toHaveBeenCalledTimes(
        1 + receipt.metrics.processedTickCount,
      );
      expect(harness.runtime.snapshot().resources.bodies).toBe(
        bodyCountBeforeWithdrawal - 1,
      );
    } finally {
      await harness.runtime.dispose();
    }
  }, 60_000);

  it("rejects real unmatched static support and a wrong resolved path surface at tick zero", async () => {
    const [pedestalHarness, wrongSurfaceHarness] = await acquireRuntimeHarnessPair(
      () => createRuntimeHarness(
        fixture,
        "route-probe-unmatched",
        withStaticSupportAtStart(fixture, 1),
      ),
      () => createRuntimeHarness(
        fixture,
        "route-probe-wrong-surface",
      ),
      async (harness) => harness.runtime.dispose(),
    );
    try {
      const [unmatched, wrongResolved] = await Promise.all([
        runProbe(fixture, pedestalHarness.port),
        runProbe(
          fixture,
          wrongSurfaceHarness.port,
          pathWithWrongResolvedSurface(fixture),
        ),
      ]);

      expect(unmatched.status).toBe("failed");
      expect(wrongResolved.status).toBe("failed");
      if (unmatched.status !== "failed" || wrongResolved.status !== "failed") {
        return;
      }
      expect(unmatched.failure).toMatchObject({
        kind: "support-surface-mismatch",
        failureProbeTick: 0,
        surfaceResolutionMode: "unmatched",
      });
      expect(unmatched.metrics.processedTickCount).toBe(0);
      expect(wrongResolved.failure).toMatchObject({
        kind: "support-surface-mismatch",
        failureProbeTick: 0,
        surfaceResolutionMode: "resolved",
      });
      expect(wrongResolved.metrics.wrongSupportSurfaceCount).toBe(1);
    } finally {
      await Promise.all([
        pedestalHarness.runtime.dispose(),
        wrongSurfaceHarness.runtime.dispose(),
      ]);
    }
  }, 60_000);

  it("keeps receipt and final world state identical across 30/60/120-like render cadences", async () => {
    const cadenceCases = [
      { name: "30", renderAfterTick: (tick: number) => tick % 2 === 0 ? 1 : 0 },
      { name: "60", renderAfterTick: () => 1 },
      { name: "120", renderAfterTick: () => 2 },
    ] as const;
    const results: Array<{
      readonly receiptHash: string;
      readonly finalState: unknown;
      readonly renderFrameCount: number;
      readonly processedTickCount: number;
    }> = [];
    for (const cadence of cadenceCases) {
      const harness = await createRuntimeHarness(
        fixture,
        `route-probe-cadence-${cadence.name}`,
      );
      let fixedTickCount = 0;
      let renderFrameCount = 0;
      try {
        const port = wrapTraversalPort(harness.port, {
          afterTick: () => {
            fixedTickCount += 1;
            const count = cadence.renderAfterTick(fixedTickCount);
            for (let index = 0; index < count; index += 1) {
              harness.runtime.renderFrame();
              renderFrameCount += 1;
            }
          },
        });
        const receipt = await runProbe(fixture, port);
        expect(receipt.status).toBe("complete");
        expect(harness.runtime.snapshot().tick).toBe(
          receipt.metrics.processedTickCount,
        );
        results.push({
          receiptHash: hashRouteRuntimeProbeReceiptV2(receipt),
          finalState: structuredClone(
            harness.runtime.snapshot().subjectStatesByEntityId.player,
          ),
          renderFrameCount,
          processedTickCount: receipt.metrics.processedTickCount,
        });
      } finally {
        await harness.runtime.dispose();
      }
    }

    expect(new Set(results.map((result) => result.receiptHash)).size).toBe(1);
    expect(results.map((result) => result.finalState)).toEqual([
      results[0]!.finalState,
      results[0]!.finalState,
      results[0]!.finalState,
    ]);
    const fixedTicks = results[0]!.processedTickCount;
    expect(results.map((result) => result.processedTickCount)).toEqual([
      fixedTicks,
      fixedTicks,
      fixedTicks,
    ]);
    expect(results.map((result) => result.renderFrameCount)).toEqual([
      Math.floor(fixedTicks / 2),
      fixedTicks,
      fixedTicks * 2,
    ]);
  }, 60_000);

  it("keeps world-XZ intent and runtime evidence independent from camera yaw", async () => {
    const [noYawHarness, yawHarness] = await acquireRuntimeHarnessPair(
      () => createRuntimeHarness(fixture, "route-probe-yaw-0"),
      () => createRuntimeHarness(fixture, "route-probe-yaw-90"),
      async (harness) => harness.runtime.dispose(),
    );
    try {
      const noYawPort = wrapTraversalPort(noYawHarness.port, {
        afterReset: () => {
          noYawHarness.runtime.adjustCameraView({ yawDeltaRadians: 0 });
        },
      });
      const yawPort = wrapTraversalPort(yawHarness.port, {
        afterReset: () => {
          yawHarness.runtime.adjustCameraView({ yawDeltaRadians: Math.PI / 2 });
        },
      });
      const [noYaw, yawed] = await Promise.all([
        runProbe(fixture, noYawPort),
        runProbe(fixture, yawPort),
      ]);

      expect(noYawHarness.runtime.snapshot().camera.viewYawOffsetRadians).not.toBe(
        yawHarness.runtime.snapshot().camera.viewYawOffsetRadians,
      );
      expect(noYaw.ticks.map((tick) => tick.walkDirectionWorldXZ)).toEqual(
        yawed.ticks.map((tick) => tick.walkDirectionWorldXZ),
      );
      expect(noYaw.ticks.map((tick) => tick.runtimeEvidence)).toEqual(
        yawed.ticks.map((tick) => tick.runtimeEvidence),
      );
      expect(hashRouteRuntimeProbeReceiptV2(noYaw)).toBe(
        hashRouteRuntimeProbeReceiptV2(yawed),
      );
    } finally {
      await Promise.all([
        noYawHarness.runtime.dispose(),
        yawHarness.runtime.dispose(),
      ]);
    }
  }, 60_000);

  it("restores pass and fail runtimes on reset and disposes every runtime owner once", async () => {
    const acquisitionError = new Error("second harness acquisition failed");
    const firstOwner = { dispose: vi.fn(async () => undefined) };
    await expect(acquireRuntimeHarnessPair(
      async () => firstOwner,
      async () => { throw acquisitionError; },
      async (owner) => owner.dispose(),
    )).rejects.toBe(acquisitionError);
    expect(firstOwner.dispose).toHaveBeenCalledTimes(1);

    for (const scenario of ["pass", "fail"] as const) {
      const executionPlan = scenario === "pass"
        ? fixture.executionPlan
        : withBlockingWall(fixture);
      const harness = await createRuntimeHarness(
        fixture,
        `route-probe-cleanup-${scenario}`,
        executionPlan,
      );
      const baseline = runtimeLedger(harness);
      const scene = harness.engine.scenes[0]!;
      const sceneDispose = vi.spyOn(scene, "dispose");
      const engineDispose = vi.spyOn(harness.engine, "dispose");
      try {
        const receipt = await runProbe(fixture, harness.port);
        expect(receipt.status).toBe(scenario === "pass" ? "complete" : "failed");
        const reset = harness.runtime.reset();
        expect(runtimeLedger(harness)).toEqual(baseline);
        expect(Object.values(reset.subjectStatesByEntityId).every(
          (subject) => subject.velocityMetersPerSecondXYZ.every(
            (component) => component === 0,
          ),
        )).toBe(true);
      } finally {
        await harness.runtime.dispose();
        await harness.runtime.dispose();
      }
      expect(sceneDispose).toHaveBeenCalledTimes(1);
      expect(engineDispose).toHaveBeenCalledTimes(1);
      expect(harness.engine.scenes).toHaveLength(0);
      expect(() => harness.port.readLatestTickEvidence()).toThrow(
        "TRAVERSAL_RUNTIME_UNAVAILABLE",
      );
    }
  }, 60_000);

  it("does not leak counters or resources across two sequential probe runs", async () => {
    const harness = await createRuntimeHarness(fixture, "route-probe-sequential");
    try {
      const baseline = runtimeLedger(harness);
      const first = await runProbe(fixture, harness.port);
      const afterFirst = runtimeLedger(harness);
      const second = await runProbe(fixture, harness.port);

      expect(first.status).toBe("complete");
      expect(second.status).toBe("complete");
      expect(hashRouteRuntimeProbeReceiptV2(first)).toBe(
        hashRouteRuntimeProbeReceiptV2(second),
      );
      expect(first.metrics).toEqual(second.metrics);
      expect(runtimeLedger(harness)).toEqual(afterFirst);
      expect(afterFirst).toEqual(baseline);
    } finally {
      await harness.runtime.dispose();
    }
  }, 60_000);

  it("isolates two concurrent runtimes with independent pass/fail outcomes", async () => {
    const [passHarness, failHarness] = await acquireRuntimeHarnessPair(
      () => createRuntimeHarness(fixture, "route-probe-concurrent-pass"),
      () => createRuntimeHarness(
        fixture,
        "route-probe-concurrent-fail",
        withBlockingWall(fixture),
      ),
      async (harness) => harness.runtime.dispose(),
    );
    try {
      const [passed, failed] = await Promise.all([
        runProbe(fixture, passHarness.port),
        runProbe(fixture, failHarness.port),
      ]);

      expect(passed.status).toBe("complete");
      expect(failed.status).toBe("failed");
      if (failed.status === "failed") {
        expect(failed.failure.kind).toBe("runtime-stalled");
      }
      expect(failed.metrics.unexpectedSupportLossCount).toBe(0);
      expect(failHarness.runtime.snapshot().resources.bodies).toBe(
        passHarness.runtime.snapshot().resources.bodies + 1,
      );
    } finally {
      await Promise.all([
        passHarness.runtime.dispose(),
        failHarness.runtime.dispose(),
      ]);
    }
  }, 60_000);

  it("starts from the real Anchor instead of a wide-corridor centroid", async () => {
    const wideFixture = await prepareRealRouteFixture(
      createRouteAuthoringSpec({
        startX: 3,
        goalX: 3,
        routeWidthMeters: 8,
      }),
    );
    const firstPathPosition = wideFixture.routePathReceipt
      .orderedPathPositionsMetersXYZ[0]!;
    expect(Math.hypot(firstPathPosition[0] - 3, firstPathPosition[2] - 4))
      .toBeLessThanOrEqual(0.52);

    const harness = await createRuntimeHarness(wideFixture, "route-probe-wide-corridor");
    try {
      const receipt = await runProbe(wideFixture, harness.port);
      expect(receipt.status).toBe("complete");
    } finally {
      await harness.runtime.dispose();
    }
  }, 60_000);
});
