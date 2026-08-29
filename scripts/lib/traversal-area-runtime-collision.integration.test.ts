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
import { createGameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import {
  BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
  BabylonWorldRuntime,
  createBabylonTraversalRuntimePortV1,
} from "@whitebox-world/runtime-babylon";
import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  createTraversalCapabilityEnvelopeV1,
  resolveTraversalGraphBuilderProfileV2,
} from "@whitebox-world/traversal";
import {
  createRouteBuildInputFromPlanV2,
  evaluateRequiredRouteV2,
} from "@whitebox-world/traversal-recast";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import { createValidAuthoringSpec } from "../../packages/authoring/src/test-fixture.js";
import { bindRuntimeTestPossession } from "../../packages/runtime-babylon/src/runtime-test-possession.js";

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
    id: "traversal-area-runtime-collision-test.gameplay",
    version: 1,
    resourceRef:
      "worldkit://gameplay-bootstrap/traversal-area-runtime-collision-test@1",
    entityDescriptors: [],
    featureResourceLocks: [],
    semanticActionDefinitions: [],
    availableCapabilityRefs: [],
    initialRelationshipStates: [],
  });

function traversalAreaAtSpawnWorld(): AuthoringSpecV4 {
  const source = createValidAuthoringSpec();
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
            transform: { positionMetersXYZ: [0, 0, 4] },
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
    nodes: [
      ...nodes,
      {
        id: "goal",
        kind: "anchor",
        placement: {
          kind: "fixed",
          transform: { positionMetersXYZ: [0, 0, -4] },
        },
        semantic: { classId: "route.destination" },
      },
    ],
    spatial: {
      ...source.spatial,
      routes: [{
        id: "main-route",
        kind: "polyline-xz",
        pointsMetersXZ: [[0, 4], [0, -4]],
        widthMeters: 4,
        locomotionProfileRef:
          "worldkit://locomotion-profile/ground.standard@1",
      }],
      traversalAreas: [{
        id: "blocked-spawn-area",
        kind: "polygon-xz",
        pointsMetersXZ: [
          [-2, 2],
          [2, 2],
          [2, 6],
          [-2, 6],
        ],
        surfaceEntityId: "terrain-main",
        mode: "blocked",
      }],
    },
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

describe("Traversal Area Runtime collision separation", () => {
  it("removes Graph support at Spawn without removing real Havok Heightfield support", async () => {
    const normalized = normalizeAuthoringSpecV4(traversalAreaAtSpawnWorld());
    if (
      !normalized.ok ||
      isNil(normalized.value) ||
      isNil(normalized.normalizedWorldIrHash)
    ) throw new Error(JSON.stringify(normalized.diagnostics));
    const compiled = compileCanonicalWorldV1({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
      gameplayBootstrap: GAMEPLAY_BOOTSTRAP,
      worldRuntimeBootstrapRef:
        `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
    });
    if (!compiled.ok || isNil(compiled.canonicalSceneExecutionPlan)) {
      throw new Error(JSON.stringify(compiled.diagnostics));
    }
    const traversalLockReceipt = compileResolvedTraversalLockV1({
      normalizedWorldIr: normalized.value,
      canonicalSceneExecutionPlan: compiled.canonicalSceneExecutionPlan,
      worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
      traversingEntityId: "player",
      runtimeImplementationIdentity:
        BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
    });
    const capabilityEnvelope = createTraversalCapabilityEnvelopeV1({
      traversalLockReceipt,
      graphBuilderProfile: resolveTraversalGraphBuilderProfileV2(
        BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
      ),
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

    expect(routeResult.status).toBe("unreachable");
    if (routeResult.status === "unreachable") {
      expect(routeResult.connectivityFailure.reason).toMatchObject({
        kind: "start-surface-not-found",
        code: "ROUTE_START_SURFACE_NOT_FOUND",
      });
    }

    const runtime = await BabylonWorldRuntime.create({
      sceneSource: {
        kind: "canonical-execution-plan",
        executionPlan: compiled.canonicalSceneExecutionPlan,
      },
      worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
      gameplayBootstrap: GAMEPLAY_BOOTSTRAP,
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
    try {
      await bindRuntimeTestPossession(runtime, "player");
      const port = createBabylonTraversalRuntimePortV1({
        runtime,
        traversalLockReceipt,
      });
      const reset = port.resetToStartAnchor({
        startAnchorEntityId: "spawn-main",
      });
      expect(reset.characterSupport).toMatchObject({
        supportState: "supported",
        surfaceResolution: {
          mode: "resolved",
          surfaceEntityId: "terrain-main",
        },
      });

      const tick = await port.runFixedTick({ walkDirectionWorldXZ: [0, 0] });
      expect(tick.characterSupport).toMatchObject({
        supportState: "supported",
        surfaceResolution: {
          mode: "resolved",
          surfaceEntityId: "terrain-main",
        },
      });
      const playerState = runtime.snapshot().subjectStatesByEntityId.player;
      if (isNil(playerState)) throw new Error("player runtime state missing");
      expect(playerState.movementMedium).toBe("ground");
    } finally {
      await runtime.dispose();
    }
  }, 60_000);
});
