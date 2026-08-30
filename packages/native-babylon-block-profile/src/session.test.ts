import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  createBabylonNativeHostRandomV1,
  type BabylonNativeSceneBuildContextV1,
} from "@whitebox-world/native-babylon";
import { describe, expect, it } from "vitest";

interface SessionModule {
  createBabylonNativeBlockProfileSessionV1(
    context: BabylonNativeSceneBuildContextV1,
    budget: Readonly<{ maximumBlockCount: number }>,
  ): {
    createBlock(input: Readonly<{
      id: string;
      shape: "full" | "half" | "quarter" | "small";
      paletteRole:
        | "ground"
        | "route"
        | "structure"
        | "hazard"
        | "water-like-visual"
        | "background-mass";
      visualGroupId?: string;
    }>): Mesh;
    finalize(): Readonly<{
      kind: "babylon-native-block-checked-layout";
      schemaVersion: 1;
      layout: Readonly<{ blocks: readonly unknown[] }>;
      checkResult: Readonly<{
        kind: "babylon-native-block-profile-check-result";
        schemaVersion: 1;
        outcome: "passed" | "rejected";
      }>;
    }>;
    dispose(): void;
  };
}

async function loadSession(): Promise<SessionModule> {
  const modulePath = ["./", "session.js"].join("");
  return import(modulePath) as Promise<SessionModule>;
}

function createContext(scene: Scene): BabylonNativeSceneBuildContextV1 {
  return Object.freeze({
    scene,
    bootstrap: Object.freeze({
      kind: "babylon-native-scene-bootstrap",
      schemaVersion: 1,
      id: "block-profile-test",
      sceneModuleRef: "worldkit://native-scene/block-profile-test@1",
      nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
      nativeSceneProfileRef:
        "worldkit://native-scene-profile/whitebox.blocks@1",
      gameplayBootstrapRef:
        "worldkit://gameplay-bootstrap/block-profile-test@1",
      initialControlledEntityId: "player",
      gravityMetersPerSecondSquaredXYZ: Object.freeze([0, -9.81, 0] as const),
      initialCamera: Object.freeze({
        mode: "third-person",
        pitchRadians: 0.2,
        distanceMeters: 5,
        fovDegrees: 60,
        targetHeightMeters: 1.2,
      }),
      seed: 81,
      spawnMarkerId: "player-spawn",
    }),
    random: createBabylonNativeHostRandomV1(81),
    assets: Object.freeze({
      async resolve(): Promise<never> {
        throw new Error("asset resolution is outside this test");
      },
    }),
    registration: Object.freeze({
      registerSpawnMarker(): void {},
      registerStaticCollider(): void {},
    }),
  });
}

function withScene(run: (scene: Scene) => void): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    run(scene);
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

describe("Babylon Native block profile session", () => {
  it("creates one real Babylon Mesh with the exact fixed shape", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 4 },
      );
      const mesh = session.createBlock({
        id: "ridge-edge",
        shape: "quarter",
        paletteRole: "structure",
        visualGroupId: "ridge",
      });

      expect(mesh).toBeInstanceOf(Mesh);
      expect(mesh.getScene()).toBe(scene);
      expect(mesh.name).toBe("ridge-edge");
      expect(mesh.id).toBe("ridge-edge");
      const extendSize = mesh.getBoundingInfo().boundingBox.extendSize;
      expect([extendSize.x * 2, extendSize.y * 2, extendSize.z * 2])
        .toEqual([0.5, 0.5, 1]);
    });
  });

  it("leaves transforms, materials, and hierarchy Babylon-native", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 4 },
      );
      const root = new TransformNode("ridge-root", scene);
      root.position.set(2, 1, -3);
      const material = new StandardMaterial("ridge-material", scene);
      const mesh = session.createBlock({
        id: "ridge-core",
        shape: "full",
        paletteRole: "structure",
        visualGroupId: "ridge",
      });

      mesh.parent = root;
      mesh.position.set(0, 0.5, 1);
      mesh.rotation.y = Math.PI / 2;
      mesh.material = material;

      expect(mesh.parent).toBe(root);
      expect(mesh.position.asArray()).toEqual([0, 0.5, 1]);
      expect(mesh.rotation.y).toBe(Math.PI / 2);
      expect(mesh.material).toBe(material);
    });
  });

  it("enforces the selected Profile and an exact caller budget", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const context = createContext(scene);
      expect(() => createBabylonNativeBlockProfileSessionV1(
        Object.freeze({
          ...context,
          bootstrap: Object.freeze({
            ...context.bootstrap,
            nativeSceneProfileRef:
              "worldkit://native-scene-profile/something-else@1",
          }),
        }),
        { maximumBlockCount: 1 },
      )).toThrow(/WORLDKIT_NATIVE_BLOCK_PROFILE_MISMATCH/);
      for (const budget of [
        { maximumBlockCount: -1 },
        { maximumBlockCount: 1.5 },
        { maximumBlockCount: 1, legacyMaximum: 2 },
      ]) {
        expect(() => createBabylonNativeBlockProfileSessionV1(
          context,
          budget as never,
        )).toThrow(/WORLDKIT_NATIVE_BLOCK_BUDGET_INVALID/);
      }

      const initialMeshCount = scene.meshes.length;
      const session = createBabylonNativeBlockProfileSessionV1(
        context,
        { maximumBlockCount: 0 },
      );
      expect(() => session.createBlock({
        id: "over-budget",
        shape: "full",
        paletteRole: "ground",
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_COUNT_EXCEEDED/);
      expect(scene.meshes).toHaveLength(initialMeshCount);
    });
  });

  it("rejects invalid create inputs and duplicate session IDs", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 8 },
      );
      const invalid = [
        { id: " A ", shape: "full", paletteRole: "ground" },
        { id: "valid-id", shape: "cube", paletteRole: "ground" },
        { id: "valid-id", shape: "full", paletteRole: "decoration" },
        { id: "valid-id", shape: "full", paletteRole: "ground", legacy: true },
        {
          id: "valid-id",
          shape: "full",
          paletteRole: "structure",
          visualGroupId: "Bad Group",
        },
      ];
      for (const input of invalid) {
        expect(() => session.createBlock(input as never)).toThrow(
          /WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID/,
        );
      }

      session.createBlock({
        id: "stable-id",
        shape: "full",
        paletteRole: "ground",
      });
      expect(() => session.createBlock({
        id: "stable-id",
        shape: "small",
        paletteRole: "route",
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_ID_DUPLICATE/);
    });
  });

  it("closes creation after idempotent finalization", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 2 },
      );
      session.createBlock({
        id: "ground-block",
        shape: "full",
        paletteRole: "ground",
      });

      const firstResult = session.finalize();
      expect(firstResult).toMatchObject({
        kind: "babylon-native-block-checked-layout",
        schemaVersion: 1,
        checkResult: {
          kind: "babylon-native-block-profile-check-result",
          schemaVersion: 1,
          outcome: "passed",
        },
      });
      expect(firstResult.layout.blocks).toHaveLength(1);
      expect(session.finalize()).toBe(firstResult);
      expect(() => session.createBlock({
        id: "late-block",
        shape: "full",
        paletteRole: "ground",
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_SESSION_CLOSED/);
    });
  });

  it("disposes Profile-owned Meshes in reverse creation order after finalization", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 3 },
      );
      const disposalOrder: string[] = [];
      for (const id of ["first-block", "second-block", "third-block"]) {
        const mesh = session.createBlock({
          id,
          shape: "small",
          paletteRole: "ground",
        });
        const dispose = mesh.dispose.bind(mesh);
        mesh.dispose = (...arguments_) => {
          disposalOrder.push(id);
          return dispose(...arguments_);
        };
      }

      session.finalize();
      session.dispose();
      session.dispose();

      expect(disposalOrder).toEqual([
        "third-block",
        "second-block",
        "first-block",
      ]);
      expect(() => session.createBlock({
        id: "late-block",
        shape: "full",
        paletteRole: "ground",
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_SESSION_CLOSED/);
    });
  });

  it("isolates IDs and lifecycle across sessions", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const context = createContext(scene);
      const first = createBabylonNativeBlockProfileSessionV1(
        context,
        { maximumBlockCount: 1 },
      );
      const second = createBabylonNativeBlockProfileSessionV1(
        context,
        { maximumBlockCount: 1 },
      );

      expect(() => first.createBlock({
        id: "shared-id",
        shape: "small",
        paletteRole: "ground",
      })).not.toThrow();
      expect(() => second.createBlock({
        id: "shared-id",
        shape: "small",
        paletteRole: "ground",
      })).not.toThrow();
      first.finalize();
      expect(() => second.finalize()).not.toThrow();
    });
  });

  it("rejects a disposed Candidate Scene before allocating a Mesh", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const context = createContext(scene);
    scene.dispose();
    try {
      expect(() => createBabylonNativeBlockProfileSessionV1(
        context,
        { maximumBlockCount: 1 },
      )).toThrow(/WORLDKIT_NATIVE_BLOCK_SCENE_INVALID/);
    } finally {
      engine.dispose();
    }
  });
});
