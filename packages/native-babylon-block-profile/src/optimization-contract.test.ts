import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  createBabylonNativeHostRandomV1,
  defineBabylonNativeScene,
  type BabylonNativeSceneBuildContextV1,
} from "@whitebox-world/native-babylon";
import { admitBabylonNativeSceneCandidateV1 } from
  "@whitebox-world/native-babylon/host";
import { describe, expect, it } from "vitest";

import {
  assessBabylonNativeBlockOptimizationV1,
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1,
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
} from "./host.js";
import {
  materializeBabylonNativeBlockReconstructionCorpusCaseV1,
  type BabylonNativeBlockReconstructionCorpusCaseIdV1,
} from "./testing.js";
import {
  createBabylonNativeBlockProfileSessionV1,
  type BabylonNativeBlockFinalizedEpochV1,
} from "./session.js";

function context(scene: Scene): BabylonNativeSceneBuildContextV1 {
  return Object.freeze({
    scene,
    bootstrap: Object.freeze({
      kind: "babylon-native-scene-bootstrap" as const,
      schemaVersion: 1 as const,
      id: "nbr65-optimization-contract",
      sceneModuleRef: "worldkit://native-scene/nbr65-optimization@1",
      nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
      nativeSceneProfileRef:
        "worldkit://native-scene-profile/whitebox.blocks@1",
      gameplayBootstrapRef:
        "worldkit://gameplay-bootstrap/nbr65-optimization@1",
      initialControlledEntityId: "player",
      gravityMetersPerSecondSquaredXYZ: Object.freeze([0, -9.81, 0] as const),
      initialCamera: Object.freeze({
        mode: "third-person" as const,
        pitchRadians: 0.2,
        distanceMeters: 5,
        fovDegrees: 60,
        targetHeightMeters: 1.2,
      }),
      seed: 202609031,
      spawnMarkerId: "player-spawn",
    }),
    random: createBabylonNativeHostRandomV1(202609031),
    assets: Object.freeze({
      async resolve(): Promise<never> {
        throw new Error("Optimization contract fixture has no assets");
      },
    }),
    registration: Object.freeze({
      registerSpawnMarker(): void {},
      registerStaticCollider(): void {},
    }),
  });
}

async function finalizedEpoch(reverse: boolean): Promise<Readonly<{
  engine: NullEngine;
  scene: Scene;
  epoch: BabylonNativeBlockFinalizedEpochV1;
  dispose(): void;
}>> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  let session: ReturnType<typeof createBabylonNativeBlockProfileSessionV1> |
    undefined;
  let epoch: BabylonNativeBlockFinalizedEpochV1 | undefined;
  const blocks = [
    Object.freeze({
      id: "wall-a",
      shape: "full" as const,
      paletteRole: "structure" as const,
      centerMetersXYZ: Object.freeze([0, 0.5, 0] as const),
      visualGroupId: "wall-group",
      colliderGroupId: "wall-collider-group",
    }),
    Object.freeze({
      id: "wall-b",
      shape: "full" as const,
      paletteRole: "structure" as const,
      centerMetersXYZ: Object.freeze([1, 0.5, 0] as const),
      visualGroupId: "wall-group",
      colliderGroupId: "wall-collider-group",
    }),
  ];
  const fixtureContext = context(scene);
  const admission = await admitBabylonNativeSceneCandidateV1({
    candidate: Object.freeze({ engine, scene }),
    hostDerivedStaticColliders: Object.freeze([]),
    bootstrap: fixtureContext.bootstrap,
    module: defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "nbr65-optimization-contract-module",
      build(buildContext): void {
        session = createBabylonNativeBlockProfileSessionV1(
          buildContext,
        );
        for (const block of reverse ? [...blocks].reverse() : blocks) {
          session.createBlock(block);
        }
        epoch = session.finalize(Object.freeze({
          staticColliders: Object.freeze([Object.freeze({
            id: "wall-collider",
            colliderGeometrySource: Object.freeze({
              kind: "block-group" as const,
              colliderGroupId: "wall-collider-group",
            }),
            traversalBinding: Object.freeze({
              kind: "not-traversable" as const,
            }),
            exposedEdgePolicy: "none" as const,
            frictionRatio: 0.25,
            restitutionRatio: 0.5,
          })]),
        }));
        buildContext.registration.registerSpawnMarker(Object.freeze({
          id: buildContext.bootstrap.spawnMarkerId,
          positionMetersXYZ: Object.freeze([0, 1, 3] as const),
          facingRadians: 0,
        }));
      },
    }),
    assets: fixtureContext.assets,
    budget: Object.freeze({
      maximumStaticColliderCount: 4,
      maximumStaticColliderVertexCount: 128,
      maximumStaticColliderTriangleCount: 128,
    }),
  });
  if (admission.outcome !== "passed" || session === undefined ||
    epoch === undefined) {
    throw new Error("Optimization contract fixture admission failed");
  }
  return Object.freeze({
    engine,
    scene,
    epoch,
    dispose(): void {
      session?.dispose();
      scene.dispose();
      engine.dispose();
    },
  });
}

function expectDeeplyFrozen(value: unknown, path = "assessment"): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value), path).toBe(true);
  for (const [key, child] of Object.entries(value)) {
    expectDeeplyFrozen(child, `${path}.${key}`);
  }
}

describe("NBR-65 current topology optimization contract", () => {
  it("measures deterministic visual batching without reviving per-Block Collider coalescing", async () => {
    const fixture = await finalizedEpoch(false);
    const reversed = await finalizedEpoch(true);
    try {
      expect(fixture.epoch.colliderInventory).toEqual([
        expect.objectContaining({
          colliderId: "wall-collider",
          sourceBlockIds: ["wall-a", "wall-b"],
          visualGroupIds: ["wall-group"],
          proxyKind: "exact-solid-union",
          traversalBinding: { kind: "not-traversable" },
          exposedEdgePolicy: "none",
          frictionRatio: 0.25,
          restitutionRatio: 0.5,
          topologyHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        }),
      ]);
      const assessment = assessBabylonNativeBlockOptimizationV1({
        finalizedEpoch: fixture.epoch,
        chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      });
      const reversedAssessment = assessBabylonNativeBlockOptimizationV1({
        finalizedEpoch: reversed.epoch,
        chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      });
      expect(assessment).toMatchObject({
        kind: "babylon-native-block-optimization-assessment",
        schemaVersion: 1,
        chunkPolicyHash: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1,
        thinInstanceGroups: [{
          visualChunkIndexXZ: [0, 0],
          blockIds: ["wall-a", "wall-b"],
        }],
        independentVisualBlockIds: [],
        topologyColliderIds: ["wall-collider"],
        baselineResources: {
          visualMeshCount: 2,
          visualDrawUnitCount: 2,
          visualGeometryBufferSetCount: 2,
          paletteMaterialCount: 1,
          colliderProxyCount: 1,
        },
        projectedResources: {
          thinInstanceBatchCount: 1,
          independentVisualMeshCount: 0,
          visualDrawUnitCount: 1,
          visualGeometryBufferSetCount: 1,
          residencyGroupCount: 1,
          colliderProxyCount: 1,
        },
        equivalence: {
          areBlockIdsPreserved: true,
          isResidencyCoverageComplete: true,
          isSemanticCaptureMembershipPreserved: true,
          areColliderIdsPreserved: true,
          areColliderSemanticsPreserved: true,
          isColliderTopologyPreserved: true,
        },
      });
      expect(assessment.baselineResources.colliderTriangleCount).toBeGreaterThan(0);
      expect(assessment.projectedResources.colliderTriangleCount)
        .toBe(assessment.baselineResources.colliderTriangleCount);
      expect(reversedAssessment).toEqual(assessment);
      expectDeeplyFrozen(assessment);
    } finally {
      reversed.dispose();
      fixture.dispose();
    }
  });

  it("rejects forged topology identity instead of publishing partial evidence", async () => {
    const fixture = await finalizedEpoch(false);
    try {
      expect(() => assessBabylonNativeBlockOptimizationV1({
        chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
        finalizedEpoch: Object.freeze({
          ...fixture.epoch,
          colliderInventory: Object.freeze([Object.freeze({
            ...fixture.epoch.colliderInventory[0]!,
            topologyHash: "not-a-hash" as `sha256:${string}`,
          })]),
        }),
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_OPTIMIZATION_INPUT_INVALID/);
    } finally {
      fixture.dispose();
    }
  });

  it("measures every positive reconstruction family from current topology Colliders", async () => {
    const caseIds = [
      "mountain-cliff",
      "t-shaped-traversal",
      "ordinary-and-blocked-steps",
      "building-exterior",
      "limited-interior",
    ] as const satisfies readonly BabylonNativeBlockReconstructionCorpusCaseIdV1[];
    for (const caseId of caseIds) {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      try {
        let epoch: BabylonNativeBlockFinalizedEpochV1 | undefined;
        const fixtureContext = context(scene);
        const admission = await admitBabylonNativeSceneCandidateV1({
          candidate: Object.freeze({ engine, scene }),
          hostDerivedStaticColliders: Object.freeze([]),
          bootstrap: fixtureContext.bootstrap,
          module: defineBabylonNativeScene({
            kind: "babylon-native-scene-module",
            id: `nbr65-${caseId}-module`,
            build(buildContext): void {
              const result = materializeBabylonNativeBlockReconstructionCorpusCaseV1(
                buildContext,
                caseId,
              );
              if (result.outcome !== "finalized") {
                throw new Error(`${caseId} unexpectedly rejected`);
              }
              epoch = result.epoch;
            },
          }),
          assets: fixtureContext.assets,
          budget: Object.freeze({
            maximumStaticColliderCount: 24,
            maximumStaticColliderVertexCount: 512,
            maximumStaticColliderTriangleCount: 512,
          }),
        });
        if (admission.outcome !== "passed" || epoch === undefined) {
          throw new Error(`${caseId} admission unexpectedly rejected`);
        }
        const assessment = assessBabylonNativeBlockOptimizationV1({
          finalizedEpoch: epoch,
          chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
        });
        expect(assessment.topologyColliderIds).toEqual(
          epoch.colliderInventory.map(({ colliderId }) => colliderId).sort(),
        );
        expect(assessment.projectedResources.colliderTriangleCount)
          .toBe(assessment.baselineResources.colliderTriangleCount);
      } finally {
        scene.dispose();
        engine.dispose();
      }
    }
  });
});
