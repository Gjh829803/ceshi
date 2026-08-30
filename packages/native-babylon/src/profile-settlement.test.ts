import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import { describe, expect, it } from "vitest";

import { createBabylonNativeHostRandomV1 } from "./random.js";
import type { BabylonNativeSceneBuildContextV1 } from "./module.js";
import {
  beginBabylonNativeProfileSettlementRecorderV1,
  closeBabylonNativeProfileSettlementRecorderV1,
  commitBabylonNativeProfileSettlementV1,
  finalizeBabylonNativeProfileSettlementV1,
  unbindBabylonNativeProfileSettlementRecorderV1,
} from "./profile-settlement.js";

const HASH_A = `sha256:${"1".repeat(64)}` as const;

function createContext(scene: Scene): BabylonNativeSceneBuildContextV1 {
  return Object.freeze({
    scene,
    bootstrap: Object.freeze({
      kind: "babylon-native-scene-bootstrap" as const,
      schemaVersion: 1 as const,
      id: "block-settlement-test",
      sceneModuleRef: "worldkit://native-scene/block-settlement-test@1",
      nativeSceneApiRef: "worldkit://native-scene-api/babylon-native@1",
      nativeSceneProfileRef:
        "worldkit://native-scene-profile/whitebox.blocks@1",
      gameplayBootstrapRef: "worldkit://gameplay-bootstrap/test@1",
      initialControlledEntityId: "g-bot-primary",
      gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0] as const,
      initialCamera: Object.freeze({
        mode: "third-person" as const,
        pitchRadians: 0.18,
        distanceMeters: 5,
        fovDegrees: 56,
        targetHeightMeters: 1.2,
      }),
      seed: 42,
      spawnMarkerId: "player-spawn",
    }),
    random: createBabylonNativeHostRandomV1(42),
    assets: Object.freeze({
      resolve: async () => {
        throw new Error("unused");
      },
    }),
    registration: Object.freeze({
      registerSpawnMarker() {},
      registerStaticCollider() {},
    }),
  });
}

function createHarness() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const context = createContext(scene);
  return { context, engine, scene };
}

function batch(meshes: readonly ReturnType<typeof MeshBuilder.CreateBox>[]) {
  return {
    kind: "babylon-native-profile-settlement-batch" as const,
    schemaVersion: 1 as const,
    profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
    profileInventoryHash: HASH_A,
    targets: meshes.map((mesh, index) => ({
      elementId: `block-${String(index + 1).padStart(2, "0")}`,
      mesh,
      collisionBinding: { kind: "none" as const },
    })),
  };
}

function errorCode(operation: () => unknown): string | undefined {
  try {
    operation();
    return undefined;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : undefined;
  }
}

describe("Host-private Babylon Native Profile settlement", () => {
  it("requires one active Context-bound recorder", () => {
    const { context, engine, scene } = createHarness();
    const mesh = MeshBuilder.CreateBox("block", { size: 1 }, scene);

    expect(errorCode(() => commitBabylonNativeProfileSettlementV1(
      context,
      batch([mesh]),
    ))).toBe("WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_UNAVAILABLE");

    scene.dispose();
    engine.dispose();
  });

  it("commits one deterministic detached receipt after close and recheck", () => {
    const run = (reverse: boolean) => {
      const { context, engine, scene } = createHarness();
      const alpha = MeshBuilder.CreateBox("alpha", { size: 1 }, scene);
      alpha.position.set(2, 0.5, -1);
      const beta = MeshBuilder.CreateBox("beta", { width: 2, height: 1, depth: 3 }, scene);
      beta.position.set(-2, 0.5, 1);
      beginBabylonNativeProfileSettlementRecorderV1(context);
      const input = batch(reverse ? [beta, alpha] : [alpha, beta]);
      commitBabylonNativeProfileSettlementV1(context, input);
      closeBabylonNativeProfileSettlementRecorderV1(context);
      const result = finalizeBabylonNativeProfileSettlementV1(context);
      unbindBabylonNativeProfileSettlementRecorderV1(context);
      scene.dispose();
      engine.dispose();
      return result.receipt;
    };

    const first = run(false);
    const second = run(false);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      kind: "host-snapshot",
      profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
      targetCount: 2,
      profileInventoryHash: HASH_A,
    });
    expect(first.kind).toBe("host-snapshot");
    if (first.kind === "host-snapshot") {
      expect(first.settledVisualHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
    expect(Object.isFrozen(first)).toBe(true);
  });

  it.each([
    ["malformed batch", (mesh: ReturnType<typeof MeshBuilder.CreateBox>) => ({
      ...batch([mesh]),
      extra: true,
    }), "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_INVALID"],
    ["wrong profile", (mesh: ReturnType<typeof MeshBuilder.CreateBox>) => ({
      ...batch([mesh]),
      profileRef: "worldkit://native-scene-profile/whitebox.standard@1",
    }), "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_PROFILE_MISMATCH"],
    ["duplicate target", (mesh: ReturnType<typeof MeshBuilder.CreateBox>) => ({
      ...batch([mesh]),
      targets: [batch([mesh]).targets[0], batch([mesh]).targets[0]],
    }), "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_INVALID"],
  ])("retains %s even when caller catches it", (_label, makeBatch, expectedCode) => {
    const { context, engine, scene } = createHarness();
    const mesh = MeshBuilder.CreateBox("block", { size: 1 }, scene);
    beginBabylonNativeProfileSettlementRecorderV1(context);

    expect(errorCode(() => commitBabylonNativeProfileSettlementV1(
      context,
      makeBatch(mesh) as never,
    ))).toBe(expectedCode);
    closeBabylonNativeProfileSettlementRecorderV1(context);
    expect(errorCode(() => finalizeBabylonNativeProfileSettlementV1(context)))
      .toBe(expectedCode);

    unbindBabylonNativeProfileSettlementRecorderV1(context);
    scene.dispose();
    engine.dispose();
  });

  it.each([
    ["foreign", (scene: Scene) => {
      const foreignEngine = new NullEngine();
      const foreignScene = new Scene(foreignEngine);
      const mesh = MeshBuilder.CreateBox("foreign", { size: 1 }, foreignScene);
      scene.onDisposeObservable.add(() => {
        foreignScene.dispose();
        foreignEngine.dispose();
      });
      return mesh;
    }],
    ["disposed", (scene: Scene) => {
      const mesh = MeshBuilder.CreateBox("disposed", { size: 1 }, scene);
      mesh.dispose();
      return mesh;
    }],
    ["parented", (scene: Scene) => {
      const parent = MeshBuilder.CreateBox("parent", { size: 1 }, scene);
      const mesh = MeshBuilder.CreateBox("parented", { size: 1 }, scene);
      mesh.parent = parent;
      return mesh;
    }],
    ["instanced", (scene: Scene) => {
      const mesh = MeshBuilder.CreateBox("instanced", { size: 1 }, scene);
      Object.defineProperty(mesh, "instances", {
        configurable: true,
        value: [{}],
      });
      return mesh;
    }],
    ["thin", (scene: Scene) => {
      const mesh = MeshBuilder.CreateBox("thin", { size: 1 }, scene);
      Object.defineProperty(mesh, "hasThinInstances", {
        configurable: true,
        value: true,
      });
      return mesh;
    }],
    ["physics", (scene: Scene) => {
      const mesh = MeshBuilder.CreateBox("physics", { size: 1 }, scene);
      Object.defineProperty(mesh, "physicsBody", { configurable: true, value: {} });
      return mesh;
    }],
  ])("rejects a %s target Mesh", (_label, makeMesh) => {
    const { context, engine, scene } = createHarness();
    const mesh = makeMesh(scene);
    beginBabylonNativeProfileSettlementRecorderV1(context);

    expect(errorCode(() => commitBabylonNativeProfileSettlementV1(
      context,
      batch([mesh]),
    ))).toBe("WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_TARGET_INVALID");

    unbindBabylonNativeProfileSettlementRecorderV1(context);
    scene.dispose();
    engine.dispose();
  });

  it("rejects duplicate and late commits", () => {
    const { context, engine, scene } = createHarness();
    const mesh = MeshBuilder.CreateBox("block", { size: 1 }, scene);
    beginBabylonNativeProfileSettlementRecorderV1(context);
    commitBabylonNativeProfileSettlementV1(context, batch([mesh]));
    expect(errorCode(() => commitBabylonNativeProfileSettlementV1(
      context,
      batch([mesh]),
    ))).toBe("WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_DUPLICATE");
    closeBabylonNativeProfileSettlementRecorderV1(context);
    expect(errorCode(() => commitBabylonNativeProfileSettlementV1(
      context,
      batch([mesh]),
    ))).toBe("WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_CLOSED");

    unbindBabylonNativeProfileSettlementRecorderV1(context);
    scene.dispose();
    engine.dispose();
  });
});
