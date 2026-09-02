import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  createBabylonNativeHostRandomV1,
  defineBabylonNativeScene,
  type BabylonNativeSceneBuildContextV1,
} from "@whitebox-world/native-babylon";
import { admitBabylonNativeSceneCandidateV1 } from
  "@whitebox-world/native-babylon/host";
import { isEmpty, isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import {
  createBabylonNativeBlockAuthoringCaptureV1,
} from "./index.js";
import {
  BABYLON_NATIVE_BLOCK_RECONSTRUCTION_CORPUS_CASE_IDS_V1,
  createBabylonNativeBlockReconstructionCorpusEvidenceIndexV1,
  inspectBabylonNativeBlockReconstructionCorpusCaseV1,
  materializeBabylonNativeBlockReconstructionCorpusCaseV1,
  type BabylonNativeBlockReconstructionCorpusCaseIdV1,
} from "./testing.js";

const POSITIVE_IDS = Object.freeze([
  "mountain-cliff",
  "t-shaped-traversal",
  "ordinary-and-blocked-steps",
  "building-exterior",
  "limited-interior",
] as const satisfies readonly BabylonNativeBlockReconstructionCorpusCaseIdV1[]);

const NEGATIVE_IDS = Object.freeze([
  "overlap-occupancy",
  "out-of-budget",
  "invalid-traversal-binding",
  "unsupported-spawn",
  "disconnected-route",
  "cleanup-throw-partial",
] as const satisfies readonly BabylonNativeBlockReconstructionCorpusCaseIdV1[]);

const EXPECTED_SEEDS = Object.freeze({
  "mountain-cliff": 202608311,
  "t-shaped-traversal": 202608312,
  "ordinary-and-blocked-steps": 202608313,
  "building-exterior": 202608314,
  "limited-interior": 202608315,
  "overlap-occupancy": 202608321,
  "out-of-budget": 202608322,
  "invalid-traversal-binding": 202608323,
  "unsupported-spawn": 202608324,
  "disconnected-route": 202608325,
  "cleanup-throw-partial": 202608326,
} as const);

const EXPECTED_NEGATIVE_CODES = Object.freeze({
  "overlap-occupancy": "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP",
  "out-of-budget": "WORLDKIT_NATIVE_BLOCK_COUNT_EXCEEDED",
  "invalid-traversal-binding": "WORLDKIT_NATIVE_BLOCK_COLLIDER_SELECTION_INVALID",
  "disconnected-route": "WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED",
  "cleanup-throw-partial": "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP",
} as const);

function bootstrap(id: string, seed: number) {
  return Object.freeze({
    kind: "babylon-native-scene-bootstrap" as const,
    schemaVersion: 1 as const,
    id,
    sceneModuleRef: `worldkit://native-scene/${id}@1`,
    nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
    nativeSceneProfileRef:
      "worldkit://native-scene-profile/whitebox.blocks@1",
    gameplayBootstrapRef: `worldkit://gameplay-bootstrap/${id}@1`,
    initialControlledEntityId: "player",
    gravityMetersPerSecondSquaredXYZ: Object.freeze([0, -9.81, 0] as const),
    initialCamera: Object.freeze({
      mode: "third-person" as const,
      pitchRadians: 0.2,
      distanceMeters: 5,
      fovDegrees: 60,
      targetHeightMeters: 1.2,
    }),
    seed,
    spawnMarkerId: "player-spawn",
  });
}

function localContext(scene: Scene, seed: number): BabylonNativeSceneBuildContextV1 {
  return Object.freeze({
    scene,
    bootstrap: bootstrap("corpus-local", seed),
    random: createBabylonNativeHostRandomV1(seed),
    assets: Object.freeze({
      async resolve(): Promise<never> {
        throw new Error("corpus contract test declares no Native assets");
      },
    }),
    registration: Object.freeze({
      registerSpawnMarker(): void {},
      registerStaticCollider(): void {},
    }),
  });
}

async function admitCase(
  caseId: BabylonNativeBlockReconstructionCorpusCaseIdV1,
): Promise<Readonly<{
  scene: Scene;
  engine: NullEngine;
  materialization: ReturnType<
    typeof materializeBabylonNativeBlockReconstructionCorpusCaseV1
  >;
}>> {
  const inspected = inspectBabylonNativeBlockReconstructionCorpusCaseV1(caseId);
  const engine = new NullEngine();
  const scene = new Scene(engine);
  let materialization: ReturnType<
    typeof materializeBabylonNativeBlockReconstructionCorpusCaseV1
  > | undefined;
  const admission = await admitBabylonNativeSceneCandidateV1({
    candidate: Object.freeze({ engine, scene }),
    hostDerivedStaticColliders: Object.freeze([]),
    bootstrap: bootstrap(`corpus-${caseId}`, inspected.seed),
    module: defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: `corpus-${caseId}-module`,
      build(context): void {
        materialization = materializeBabylonNativeBlockReconstructionCorpusCaseV1(
          context,
          caseId,
        );
      },
    }),
    assets: Object.freeze({
      async resolve(): Promise<never> {
        throw new Error("corpus contract test declares no Native assets");
      },
    }),
    budget: Object.freeze({
      maximumStaticColliderCount: 24,
      maximumStaticColliderVertexCount: 256,
      maximumStaticColliderTriangleCount: 288,
    }),
  });
  if (admission.outcome !== "passed") {
    scene.dispose();
    engine.dispose();
    throw new Error(JSON.stringify(admission.diagnostics));
  }
  if (isNil(materialization)) {
    scene.dispose();
    engine.dispose();
    throw new Error(`Corpus case '${caseId}' did not materialize.`);
  }
  return Object.freeze({ scene, engine, materialization });
}

describe("BWB-5 reconstruction corpus contract", () => {
  it("freezes one closed case table with deterministic seeds and polarity", () => {
    expect(BABYLON_NATIVE_BLOCK_RECONSTRUCTION_CORPUS_CASE_IDS_V1).toEqual([
      ...POSITIVE_IDS,
      ...NEGATIVE_IDS,
    ]);
    for (const caseId of BABYLON_NATIVE_BLOCK_RECONSTRUCTION_CORPUS_CASE_IDS_V1) {
      const inspected = inspectBabylonNativeBlockReconstructionCorpusCaseV1(
        caseId,
      );
      expect(inspected).toMatchObject({
        kind: "babylon-native-block-reconstruction-corpus-case",
        schemaVersion: 1,
        id: caseId,
        seed: EXPECTED_SEEDS[caseId],
      });
      expect(inspected.polarity).toBe(
        (POSITIVE_IDS as readonly string[]).includes(caseId)
          ? "positive"
          : "negative",
      );
      if (caseId === "unsupported-spawn") {
        expect("expectedFailureCode" in inspected).toBe(false);
      }
    }
  });

  it("materializes each positive case into one finalized Layout with visual, capture, collider, and traversalBinding", async () => {
    for (const caseId of POSITIVE_IDS) {
      const { scene, engine, materialization } = await admitCase(caseId);
      try {
        expect(materialization.outcome).toBe("finalized");
        if (materialization.outcome !== "finalized") {
          throw new Error(`positive case '${caseId}' must finalize`);
        }
        const { epoch } = materialization;
        expect(epoch.kind).toBe("babylon-native-block-finalized-epoch");
        expect(epoch.checkedLayout.checkResult.outcome).toBe("passed");
        expect(isEmpty(epoch.checkedLayout.layout.blocks)).toBe(false);
        expect(isEmpty(epoch.colliderInventory)).toBe(false);
        expect(epoch.colliderInventory).toHaveLength(
          epoch.checkedLayout.layout.blocks.length,
        );
        expect(new Set(scene.meshes.filter((mesh) =>
          mesh.name.startsWith("worldkit-block-visual-") ||
          mesh.name === mesh.id
        ).map((mesh) => mesh.id)).size).toBeGreaterThan(0);
        for (const entry of epoch.colliderInventory) {
          expect(entry.proxyKind).toBe("layout-block-volume");
          expect(
            entry.traversalBinding.kind === "static-surface" ||
            entry.traversalBinding.kind === "not-traversable",
          ).toBe(true);
        }
        const capture = createBabylonNativeBlockAuthoringCaptureV1({
          scene,
          finalizedEpoch: epoch,
          widthPixels: 96,
          heightPixels: 64,
          opening: materialization.opening,
        });
        expect(capture).toMatchObject({
          kind: "babylon-native-block-authoring-capture",
          schemaVersion: 1,
          scope: "build-epoch-local",
        });
        expect(capture.views.map(({ id }) => id)).toEqual([
          "opening",
          "top-down",
          "side",
        ]);
        const index = createBabylonNativeBlockReconstructionCorpusEvidenceIndexV1({
          caseId,
          materialization,
          authoringCapture: capture,
        });
        expect(index).toMatchObject({
          kind: "babylon-native-block-reconstruction-corpus-evidence-index",
          schemaVersion: 1,
          caseId,
          seed: EXPECTED_SEEDS[caseId],
          polarity: "positive",
          authoringCapture: capture,
          isFormalCapturePublished: false,
          isFormalRoutePublished: false,
          isRoomVisibilityClaimed: false,
          isMultilayerNavigationClaimed: false,
          isCavesClaimed: false,
          isBridgeUnderpassClaimed: false,
          isNpcNavClaimed: false,
          isGotoClaimed: false,
          isThinInstanceOptimized: false,
        });
        expect(index.checkResult?.outcome).toBe("passed");
        expect(index.colliderInventory).toEqual(epoch.colliderInventory);
      } finally {
        scene.dispose();
        engine.dispose();
      }
    }
  }, 30_000);

  it("fail-closes the negative corpus with stable diagnostic codes and cleanup", () => {
    for (const caseId of NEGATIVE_IDS) {
      if (caseId === "unsupported-spawn") continue;
      const engine = new NullEngine();
      const scene = new Scene(engine);
      try {
        const inspected = inspectBabylonNativeBlockReconstructionCorpusCaseV1(
          caseId,
        );
        const context = localContext(scene, inspected.seed);
        const originalRegister = context.registration;
        const trackedContext: BabylonNativeSceneBuildContextV1 = Object.freeze({
          ...context,
          registration: Object.freeze({
            registerSpawnMarker: originalRegister.registerSpawnMarker,
            registerStaticCollider: originalRegister.registerStaticCollider,
          }),
        });
        const beforeCount = scene.meshes.length;
        const materialization =
          materializeBabylonNativeBlockReconstructionCorpusCaseV1(
            trackedContext,
            caseId,
          );
        expect(materialization.outcome).toBe("rejected");
        if (materialization.outcome !== "rejected") {
          throw new Error(`negative case '${caseId}' must reject`);
        }
        expect(materialization.code).toBe(EXPECTED_NEGATIVE_CODES[caseId]);
        expect(materialization.failureMessage).toContain(
          EXPECTED_NEGATIVE_CODES[caseId],
        );
        expect(scene.meshes.every((mesh) => mesh.isDisposed())).toBe(true);
        expect(scene.meshes.length).toBe(beforeCount);
        const index = createBabylonNativeBlockReconstructionCorpusEvidenceIndexV1({
          caseId,
          materialization,
        });
        expect(index.polarity).toBe("negative");
        expect(index.isFormalCapturePublished).toBe(false);
        expect(index.isFormalRoutePublished).toBe(false);
        expect(index.expectedFailureCode).toBe(EXPECTED_NEGATIVE_CODES[caseId]);
      } finally {
        scene.dispose();
        engine.dispose();
      }
    }
  });

  it("keeps unsupported-spawn finalized but off support", async () => {
    const { scene, engine, materialization } = await admitCase(
      "unsupported-spawn",
    );
    try {
      expect(materialization.outcome).toBe("finalized");
      if (materialization.outcome !== "finalized") {
        throw new Error("unsupported-spawn must finalize the Layout");
      }
      expect(materialization.spawn.positionMetersXYZ[1]).toBeGreaterThan(1);
      const [spawnX, spawnY, spawnZ] = materialization.spawn.positionMetersXYZ;
      const supported = materialization.epoch.colliderInventory.some((entry) => {
        if (entry.traversalBinding.kind !== "static-surface") return false;
        const block = materialization.epoch.checkedLayout.layout.blocks.find(
          ({ id }) => id === entry.sourceBlockIds[0],
        );
        if (isNil(block)) return false;
        return spawnX >= block.minimumMetersXYZ[0] &&
          spawnX <= block.maximumMetersXYZ[0] &&
          spawnZ >= block.minimumMetersXYZ[2] &&
          spawnZ <= block.maximumMetersXYZ[2] &&
          Math.abs(spawnY - block.maximumMetersXYZ[1]) <= 0.05;
      });
      expect(supported).toBe(false);
      const index = createBabylonNativeBlockReconstructionCorpusEvidenceIndexV1({
        caseId: "unsupported-spawn",
        materialization,
      });
      expect(index.polarity).toBe("negative");
      expect("expectedFailureCode" in index).toBe(false);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
