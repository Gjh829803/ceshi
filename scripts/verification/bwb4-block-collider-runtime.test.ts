import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  type BabylonNativeSceneModuleV1,
} from "@whitebox-world/native-babylon";
import { createBabylonNativeBlockColliderRuntimeFixtureModuleV1 } from
  "@whitebox-world/native-babylon-block-profile/testing";
import { admitBabylonNativeSceneCandidateV1 } from
  "@whitebox-world/native-babylon/host";
import { BabylonWorldRuntime } from "@whitebox-world/runtime-babylon";
import { bindRuntimeTestPossession } from
  "@whitebox-world/runtime-babylon/testing";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { runtimeWorldConfigurationFromVerifiedWorldPackageV1 } from
  "@whitebox-world/runtime-host";
import {
  createBabylonNativeWorldPackageV1,
  verifyWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { createBabylonNativeBlockWorldPackageTestInputV1 } from
  "@whitebox-world/world-package/testing";
import { describe, expect, it } from "vitest";
import { isNil } from "lodash-es";

const require = createRequire(import.meta.url);
const havokWasmBytes = await readFile(
  require.resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

const RESOURCE_BUDGET = Object.freeze({
  maximumVertices: 256,
  maximumTriangles: 128,
  maximumColliders: 10,
});

async function auditedContribution(
  module: BabylonNativeSceneModuleV1,
): Promise<ReturnType<typeof createBabylonNativeBlockWorldPackageTestInputV1>["nativeSceneContribution"]> {
  const packageInput = createBabylonNativeBlockWorldPackageTestInputV1({
    resourceBudget: RESOURCE_BUDGET,
  });
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const admission = await admitBabylonNativeSceneCandidateV1({
      candidate: Object.freeze({ engine, scene }),
      bootstrap: packageInput.nativeSceneBootstrap,
      module,
      assets: Object.freeze({
        async resolve(): Promise<never> {
          throw new Error("BWB-4 fixture declares no Native assets.");
        },
      }),
      budget: Object.freeze({
        maximumStaticColliderCount: RESOURCE_BUDGET.maximumColliders,
        maximumStaticColliderVertexCount: RESOURCE_BUDGET.maximumVertices,
        maximumStaticColliderTriangleCount: RESOURCE_BUDGET.maximumTriangles,
      }),
    });
    if (admission.outcome !== "passed") {
      throw new Error(JSON.stringify(admission.diagnostics));
    }
    return admission.contribution;
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

async function createRuntime(input: Readonly<{
  packageModule?: BabylonNativeSceneModuleV1;
  runtimeModule?: BabylonNativeSceneModuleV1;
  engineFactory?: () => NullEngine;
  onInitializationStage?: (stage: string) => void;
}> = {}): Promise<BabylonWorldRuntime> {
  const packageModule = isNil(input.packageModule)
    ? createBabylonNativeBlockColliderRuntimeFixtureModuleV1()
    : input.packageModule;
  const runtimeModule = isNil(input.runtimeModule)
    ? packageModule
    : input.runtimeModule;
  const contribution = await auditedContribution(packageModule);
  const verified = verifyWorldPackageDirectoryV1(
    createBabylonNativeWorldPackageV1(
      createBabylonNativeBlockWorldPackageTestInputV1({
        resourceBudget: RESOURCE_BUDGET,
        nativeSceneContribution: contribution,
      }),
    ),
  );
  if (verified.kind !== "babylon-native-scene") {
    throw new Error("BWB-4 fixture must verify as one Babylon Native Package.");
  }
  const configuration = runtimeWorldConfigurationFromVerifiedWorldPackageV1(
    verified,
  );
  if (configuration.sceneSource.kind !== "babylon-native-scene") {
    throw new Error("BWB-4 fixture must select the Babylon Native Scene Source.");
  }
  const runtimeSessionId = "runtime.bwb4-block-collider";
  const runtime = await BabylonWorldRuntime.create({
    sceneSource: {
      kind: "babylon-native-scene",
      descriptor: Object.freeze({
        runtimeSessionId,
        worldSessionId: "world-session.bwb4-block-collider",
        worldBuildIdentity: configuration.worldBuildIdentity,
        gameplayBootstrap: configuration.gameplayBootstrap,
        worldRuntimeBootstrap: configuration.worldRuntimeBootstrap,
        sceneSource: configuration.sceneSource,
      }),
      verifiedWorldPackage: verified,
      moduleLoader: Object.freeze({ load: async () => runtimeModule }),
    },
    worldRuntimeBootstrap: verified.worldRuntimeBootstrap,
    gameplayBootstrap: verified.gameplayBootstrap,
    runtimeSessionId,
    havokWasmBinary,
    engineFactory: isNil(input.engineFactory) ? (() => new NullEngine({
      renderWidth: 64,
      renderHeight: 64,
      textureSize: 64,
      deterministicLockstep: true,
      lockstepMaxSteps: 4,
    })) : input.engineFactory,
    ...(isNil(input.onInitializationStage)
      ? {}
      : { onInitializationStage: input.onInitializationStage }),
  });
  await bindRuntimeTestPossession(
    runtime,
    verified.worldRuntimeBootstrap.initialControlledEntityId,
  );
  return runtime;
}

describe("BWB-4 Block Profile Collider Runtime", () => {
  it("replays byte-identical Contributions and Package roots from two isolated Candidates", async () => {
    const first = await auditedContribution(
      createBabylonNativeBlockColliderRuntimeFixtureModuleV1(),
    );
    const second = await auditedContribution(
      createBabylonNativeBlockColliderRuntimeFixtureModuleV1(),
    );
    expect(second).toEqual(first);
    expect(first.profileSettlement).toMatchObject({
      kind: "host-snapshot",
      profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
      targetCount: 6,
    });
    expect(first.staticColliders).toHaveLength(6);
    for (const collider of first.staticColliders) {
      expect(collider).toMatchObject({ vertexCount: 8, triangleCount: 12 });
    }
    const firstPackage = createBabylonNativeWorldPackageV1(
      createBabylonNativeBlockWorldPackageTestInputV1({
        resourceBudget: RESOURCE_BUDGET,
        nativeSceneContribution: first,
      }),
    );
    const secondPackage = createBabylonNativeWorldPackageV1(
      createBabylonNativeBlockWorldPackageTestInputV1({
        resourceBudget: RESOURCE_BUDGET,
        nativeSceneContribution: second,
      }),
    );
    expect(secondPackage.receipt.worldPackageRootHash).toBe(
      firstPackage.receipt.worldPackageRootHash,
    );
  });

  it("rejects settled visual drift before Havok, camera, or subjects", async () => {
    const initializationStages: string[] = [];
    let candidateEngine: NullEngine | undefined;
    await expect(createRuntime({
      packageModule:
        createBabylonNativeBlockColliderRuntimeFixtureModuleV1(),
      runtimeModule:
        createBabylonNativeBlockColliderRuntimeFixtureModuleV1({
          paletteRole: "structure",
        }),
      engineFactory: () => {
        candidateEngine = new NullEngine({
          renderWidth: 64,
          renderHeight: 64,
          textureSize: 64,
          deterministicLockstep: true,
          lockstepMaxSteps: 4,
        });
        return candidateEngine;
      },
      onInitializationStage: (stage) => initializationStages.push(stage),
    })).rejects.toThrow(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_CONTRIBUTION_MISMATCH",
    );
    expect(initializationStages).toEqual(["engine", "scene", "native-scene"]);
    expect(candidateEngine?.isDisposed).toBe(true);
  });

  it("passes 0.25m, blocks 0.5m, resets exactly, and loses support at the ledge", async () => {
    const runtime = await createRuntime();
    const internals = runtime as unknown as {
      scene: Scene;
      engine: NullEngine;
      runtimeSubjects: readonly Readonly<{
        entityId: string;
        collider: Readonly<{ maxStepHeightMeters: number }>;
      }>[];
    };
    const spawnCollisionMesh = internals.scene.getMeshByName(
      "worldkit.native-collider.collider-ground-zero",
    );
    const collisionMeshes = internals.scene.meshes.filter(({ name }) =>
      name.startsWith("worldkit.native-collider."));
    try {
      expect(internals.runtimeSubjects.find(({ entityId }) =>
        entityId === "player")?.collider.maxStepHeightMeters).toBe(0.3);
      expect(collisionMeshes).toHaveLength(6);
      for (const mesh of collisionMeshes) {
        expect(mesh.getVerticesData(VertexBuffer.PositionKind))
          .toHaveLength(8 * 3);
        expect(mesh.getIndices()).toHaveLength(12 * 3);
      }
      expect(spawnCollisionMesh?.metadata).toMatchObject({
        worldkitEntityId: "collider-ground-zero",
        colliderSubshapeId: expect.stringMatching(/^collider-subshape:[a-f0-9]{64}$/),
        worldkitNativeTraversalKind: "static-surface",
        worldkitSurfaceEntityId: "surface-ground-zero",
        worldkitLogicalSubshapeId: "top",
        worldkitTraversalSurfaceId: expect.stringMatching(/^traversal-surface:/),
        worldkitTraversalSurfaceProfileRef:
          "worldkit://traversal-surface-profile/ground.static@1",
      });
      const elevatedSupport = internals.scene.getPhysicsEngine()!.raycast(
        new Vector3(0, 2, -3),
        new Vector3(0, -1, -3),
      );
      expect(elevatedSupport.hasHit).toBe(true);
      expect(elevatedSupport.hitPointWorld.y).toBeCloseTo(0.25, 5);
      expect(elevatedSupport.hitNormalWorld.y).toBeGreaterThan(0.99);
      expect(elevatedSupport.body?.transformNode.metadata).toMatchObject({
        worldkitEntityId: "collider-elevated-tread",
        worldkitSurfaceEntityId: "surface-elevated-tread",
      });
      const supported = await runtime.runFixedInput({ actions: [], ticks: 5 });
      expect(supported.subjectStatesByEntityId.player).toMatchObject({
        positionMetersXYZ: [0, 0, 0],
        movementMedium: "ground",
      });

      const blocked = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 180,
      });
      expect(blocked.subjectStatesByEntityId.player!.positionMetersXYZ[2])
        .toBeLessThan(-2.5);
      expect(blocked.subjectStatesByEntityId.player!.positionMetersXYZ[2])
        .toBeGreaterThan(-3.5);
      expect(blocked.subjectStatesByEntityId.player!.positionMetersXYZ[1])
        .toBeGreaterThan(0.24);
      expect(blocked.subjectStatesByEntityId.player!.positionMetersXYZ[1])
        .toBeLessThan(0.35);
      expect(blocked.subjectStatesByEntityId.player!.movementMedium).toBe(
        "ground",
      );
      const committedHash = sha256CanonicalJson(blocked);

      runtime.reset();
      await bindRuntimeTestPossession(runtime, "player");
      await runtime.runFixedInput({ actions: [], ticks: 5 });
      const replayed = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 180,
      });
      expect(replayed).toEqual(blocked);
      expect(sha256CanonicalJson(replayed)).toBe(committedHash);

      runtime.reset();
      await bindRuntimeTestPossession(runtime, "player");
      const departed = await runtime.runFixedInput({
        actions: ["move-right"],
        ticks: 180,
      });
      expect(departed.subjectStatesByEntityId.player!.positionMetersXYZ[0])
        .toBeGreaterThan(0.5);
      expect(departed.subjectStatesByEntityId.player!.positionMetersXYZ[1])
        .toBeLessThan(-0.25);
      expect(departed.subjectStatesByEntityId.player!.movementMedium).toBe(
        "air",
      );
    } finally {
      await runtime.dispose();
    }
    expect(spawnCollisionMesh?.isDisposed()).toBe(true);
    expect(collisionMeshes.every((mesh) => mesh.isDisposed())).toBe(true);
    expect(internals.scene.isDisposed).toBe(true);
    expect(internals.engine.isDisposed).toBe(true);
  }, 30_000);
});
