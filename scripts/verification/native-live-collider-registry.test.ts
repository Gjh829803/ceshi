import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  defineBabylonNativeScene,
  type BabylonNativeSceneModuleV1,
} from "@whitebox-world/native-babylon";
import { admitBabylonNativeSceneCandidateV1 } from
  "@whitebox-world/native-babylon/host";
import {
  createBabylonNativeBlockProfileSessionV1,
  hashBabylonNativeBlockCheckedLayoutInventoryV1,
} from "@whitebox-world/native-babylon-block-profile";
import {
  takeBabylonNativeBlockCheckedEpochEvidenceV1,
  type BabylonNativeBlockCheckedEpochEvidenceV1,
} from "@whitebox-world/native-babylon-block-profile/host";
import { BabylonWorldRuntime } from "@whitebox-world/runtime-babylon";
import {
  bindRuntimeTestPossession,
  peekBabylonNativeLiveColliderRegistryV1,
} from "@whitebox-world/runtime-babylon/testing";
import {
  hashBabylonNativeSceneContributionV1,
  parseBabylonNativeBlockMaterializerMetadataV1,
  type BabylonNativeSceneContributionV1,
} from "@whitebox-world/runtime-contracts";
import { runtimeWorldConfigurationFromVerifiedWorldPackageV1 } from
  "@whitebox-world/runtime-host";
import {
  createBabylonNativeWorldPackageV1,
  verifyWorldPackageDirectoryV1,
  type VerifiedBabylonNativeWorldPackageDirectoryV1,
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

function moduleFixture(): BabylonNativeSceneModuleV1 {
  return defineBabylonNativeScene({
    kind: "babylon-native-scene-module",
    id: "package-fixture-module",
    build(context): void {
      const session = createBabylonNativeBlockProfileSessionV1(context, {
        maximumBlockCount: 1,
      });
      session.createBlock({
        id: "ground-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, -0.5, 0],
      });
      session.finalize({
        displayGapMeters: 0.04,
        staticColliders: [{
          id: "ground",
          colliderGeometrySource: Object.freeze({ kind: "block" as const, blockId: "ground-block" }),
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "ground-surface",
            logicalSubshapeId: "top",
            traversalSurfaceProfileRef:
              "worldkit://traversal-surface-profile/ground.static@1",
          },
          exposedEdgePolicy: "none",
          frictionRatio: 0.8,
          restitutionRatio: 0,
        }],
      });
      context.registration.registerSpawnMarker({
        id: context.bootstrap.spawnMarkerId,
        positionMetersXYZ: [0, 0, 0],
        facingRadians: 0,
      });
    },
  });
}

async function admittedFixture(): Promise<Readonly<{
  contribution: BabylonNativeSceneContributionV1;
  evidence: BabylonNativeBlockCheckedEpochEvidenceV1;
}>> {
  const packageInput = createBabylonNativeBlockWorldPackageTestInputV1();
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const admission = await admitBabylonNativeSceneCandidateV1({
      candidate: { engine, scene },
      bootstrap: packageInput.nativeSceneBootstrap,
      module: moduleFixture(),
      assets: Object.freeze({
        async resolve(): Promise<never> {
          throw new Error("Native live-collider fixture declares no assets.");
        },
      }),
      budget: {
        maximumStaticColliderCount: 4,
        maximumStaticColliderVertexCount: 128,
        maximumStaticColliderTriangleCount: 64,
      },
    });
    if (admission.outcome !== "passed") {
      throw new Error(JSON.stringify(admission.diagnostics));
    }
    const evidence = takeBabylonNativeBlockCheckedEpochEvidenceV1(scene);
    if (evidence.length !== 1 || isNil(evidence[0])) {
      throw new Error("Expected one checked Native Block epoch.");
    }
    return Object.freeze({ contribution: admission.contribution, evidence: evidence[0] });
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

function packageFixture(
  contribution: BabylonNativeSceneContributionV1,
  evidence: BabylonNativeBlockCheckedEpochEvidenceV1,
): VerifiedBabylonNativeWorldPackageDirectoryV1 {
  if (contribution.profileSettlement.kind !== "host-snapshot") {
    throw new Error("Expected committed Block settlement.");
  }
  const base = createBabylonNativeBlockWorldPackageTestInputV1();
  const metadata = base.nativeBlockMaterializerMetadata;
  if (isNil(metadata)) throw new Error("Expected Block metadata fixture.");
  const nativeBlockMaterializerMetadata =
    parseBabylonNativeBlockMaterializerMetadataV1({
      ...metadata,
      checkedLayoutInventoryHash:
        hashBabylonNativeBlockCheckedLayoutInventoryV1(evidence.checkedLayout),
      contributionHash: hashBabylonNativeSceneContributionV1(contribution),
      profileInventoryHash: evidence.profileInventoryHash,
      settledVisualHash: contribution.profileSettlement.settledVisualHash,
      blocks: evidence.checkedLayout.layout.blocks.map((block) => ({
        blockId: block.id,
        runtimeEntityId: `native-block:${block.id}`,
        semanticCaptureClassId:
          `worldkit.native-block.group.${block.visualGroupId ?? "ungrouped"}`,
        shape: block.shape,
        paletteRole: block.paletteRole,
        ...(isNil(block.visualGroupId) ? {} : { visualGroupId: block.visualGroupId }),
        centerMetersXYZ: block.centerMetersXYZ,
        rotationQuarterTurnsY: block.rotationQuarterTurnsY,
        sizeMetersXYZ: block.sizeMetersXYZ,
      })),
      visualGroups: [],
      colliderJoins: evidence.colliderInventory.map((entry) => ({
        blockId: entry.sourceBlockIds[0],
        colliderId: entry.colliderId,
      })),
    });
  const verified = verifyWorldPackageDirectoryV1(
    createBabylonNativeWorldPackageV1(
      createBabylonNativeBlockWorldPackageTestInputV1({
        resourceBudget: {
          maximumVertices: 128,
          maximumTriangles: 64,
          maximumColliders: 4,
        },
        nativeSceneContribution: contribution,
        nativeBlockMaterializerMetadata,
      }),
    ),
  );
  if (verified.kind !== "babylon-native-scene") throw new Error("unreachable");
  return verified;
}

async function createVerifiedFixture(): Promise<
  VerifiedBabylonNativeWorldPackageDirectoryV1
> {
  const admitted = await admittedFixture();
  return packageFixture(admitted.contribution, admitted.evidence);
}

async function createRuntime(input: Readonly<{
  engineFactory?: () => NullEngine;
  onInitializationStage?: (stage: string) => void;
}> = {}): Promise<Readonly<{
  runtime: BabylonWorldRuntime;
  scene: Scene;
}>> {
  const verified = await createVerifiedFixture();
  const configuration = runtimeWorldConfigurationFromVerifiedWorldPackageV1(
    verified,
  );
  if (configuration.sceneSource.kind !== "babylon-native-scene") {
    throw new Error("unreachable");
  }
  const runtime = await BabylonWorldRuntime.create({
    sceneSource: {
      kind: "babylon-native-scene",
      descriptor: {
        runtimeSessionId: "runtime.native-live-collider",
        worldSessionId: "world-session.native-live-collider",
        worldBuildIdentity: configuration.worldBuildIdentity,
        gameplayBootstrap: configuration.gameplayBootstrap,
        worldRuntimeBootstrap: configuration.worldRuntimeBootstrap,
        sceneSource: configuration.sceneSource,
      },
      verifiedWorldPackage: verified,
      moduleLoader: Object.freeze({ load: async () => moduleFixture() }),
    },
    worldRuntimeBootstrap: verified.worldRuntimeBootstrap,
    gameplayBootstrap: verified.gameplayBootstrap,
    runtimeSessionId: "runtime.native-live-collider",
    havokWasmBinary,
    engineFactory: input.engineFactory ?? (() =>
      new NullEngine({
        renderWidth: 64,
        renderHeight: 64,
        textureSize: 64,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      })),
    ...(isNil(input.onInitializationStage)
      ? {}
      : { onInitializationStage: input.onInitializationStage }),
  });
  const scene = (runtime as unknown as { scene: Scene }).scene;
  await bindRuntimeTestPossession(
    runtime,
    verified.worldRuntimeBootstrap.initialControlledEntityId,
  );
  return Object.freeze({ runtime, scene });
}

describe("SDK-owned Native live collider registry", () => {
  it("joins verified Block metadata to live Babylon and Havok handles without Scene scanning", async () => {
    const { runtime, scene } = await createRuntime();
    const registry = peekBabylonNativeLiveColliderRegistryV1(scene);
    const record = registry?.colliders[0];
    try {
      expect(registry).toMatchObject({
        kind: "babylon-native-live-collider-registry",
        schemaVersion: 1,
      });
      expect(registry?.colliders).toHaveLength(1);
      expect(record).toMatchObject({
        colliderId: "ground",
        sourceBlockId: "ground-block",
        physicsBodyId: "physics-body:ground",
        overlayRecordId: "overlay:ground",
      });
      expect(record?.colliderSubshapeId).toMatch(
        /^collider-subshape:[a-f0-9]{64}$/,
      );
      expect(record?.body.isDisposed).toBe(false);
      expect(record?.body.transformNode).toBe(record?.mesh);
      expect(record?.body.shape).toBe(record?.shape);
      expect(record?.aggregate.transformNode).toBe(record?.mesh);
      expect(record?.aggregate.body).toBe(record?.body);
      expect(record?.aggregate.shape).toBe(record?.shape);

      const decoy = new Mesh("worldkit.native-collider.decoy", scene);
      decoy.metadata = {
        worldkitEntityId: "decoy",
        colliderSubshapeId: `collider-subshape:${"d".repeat(64)}`,
      };
      expect(peekBabylonNativeLiveColliderRegistryV1(scene)).toBe(registry);
    } finally {
      await runtime.dispose();
    }
    expect(peekBabylonNativeLiveColliderRegistryV1(scene)).toBeUndefined();
    expect(record?.body.isDisposed).toBe(true);
    expect(record?.mesh.isDisposed()).toBe(true);
  }, 15_000);

  it("keeps two admitted Candidate registries isolated", async () => {
    const first = await createRuntime();
    const second = await createRuntime();
    try {
      const firstRegistry = peekBabylonNativeLiveColliderRegistryV1(first.scene);
      const secondRegistry = peekBabylonNativeLiveColliderRegistryV1(second.scene);
      expect(firstRegistry).not.toBe(secondRegistry);
      expect(firstRegistry?.colliders[0]?.mesh)
        .not.toBe(secondRegistry?.colliders[0]?.mesh);
      await first.runtime.dispose();
      expect(peekBabylonNativeLiveColliderRegistryV1(first.scene))
        .toBeUndefined();
      expect(peekBabylonNativeLiveColliderRegistryV1(second.scene))
        .toBe(secondRegistry);
    } finally {
      await first.runtime.dispose();
      await second.runtime.dispose();
    }
  }, 15_000);

  it("unregisters and disposes live handles when initialization fails after Havok", async () => {
    let engine: NullEngine | undefined;
    let scene: Scene | undefined;
    let registry: ReturnType<
      typeof peekBabylonNativeLiveColliderRegistryV1
    >;
    const error = await createRuntime({
      engineFactory: () => {
        engine = new NullEngine({
          renderWidth: 64,
          renderHeight: 64,
          textureSize: 64,
          deterministicLockstep: true,
          lockstepMaxSteps: 4,
        });
        return engine;
      },
      onInitializationStage: (stage) => {
        if (stage !== "camera" || isNil(engine)) return;
        scene = engine.scenes[0];
        if (isNil(scene)) throw new Error("Candidate Scene missing.");
        registry = peekBabylonNativeLiveColliderRegistryV1(scene);
        throw new Error("expected camera-stage failure");
      },
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("expected camera-stage failure");
    expect(scene).toBeDefined();
    expect(registry?.colliders).toHaveLength(1);
    expect(peekBabylonNativeLiveColliderRegistryV1(scene!)).toBeUndefined();
    expect(registry?.colliders.every((record) =>
      record.body.isDisposed && record.mesh.isDisposed(),
    )).toBe(true);
    expect(scene?.isDisposed).toBe(true);
    expect(engine?.isDisposed).toBe(true);
  }, 15_000);

  it("unregisters before a throwing aggregate cleanup and still disposes siblings", async () => {
    const { runtime, scene } = await createRuntime();
    const registry = peekBabylonNativeLiveColliderRegistryV1(scene);
    const record = registry?.colliders[0];
    if (isNil(record)) throw new Error("Expected one live collider record.");
    const originalDispose = record.aggregate.dispose.bind(record.aggregate);
    record.aggregate.dispose = () => {
      originalDispose();
      throw new Error("expected aggregate cleanup failure");
    };

    await expect(runtime.dispose()).rejects.toThrow(
      "WORLDKIT_RUNTIME_DISPOSE_FAILED",
    );
    expect(peekBabylonNativeLiveColliderRegistryV1(scene)).toBeUndefined();
    expect(record.body.isDisposed).toBe(true);
    expect(record.mesh.isDisposed()).toBe(true);
    expect(scene.isDisposed).toBe(true);
  }, 15_000);
});
