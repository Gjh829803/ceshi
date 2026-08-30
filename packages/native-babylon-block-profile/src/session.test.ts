import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  createBabylonNativeHostRandomV1,
  type BabylonNativeSceneBuildContextV1,
  type BabylonNativeStaticColliderV1,
} from "@whitebox-world/native-babylon";
import { beforeEach, describe, expect, it, vi } from "vitest";

const commitProfileSettlement = vi.hoisted(() => vi.fn());
vi.mock("@whitebox-world/native-babylon/host", () => ({
  commitBabylonNativeProfileSettlementV1: commitProfileSettlement,
}));

beforeEach(() => {
  commitProfileSettlement.mockReset();
  commitProfileSettlement.mockImplementation(() => {});
});

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
    finalize(input: Readonly<{
      staticColliders: readonly Readonly<{
        id: string;
        blockId: string;
        traversalBinding: Readonly<{ kind: "not-traversable" }>;
      }>[];
    }>): Readonly<{
      kind: "babylon-native-block-finalized-epoch";
      schemaVersion: 1;
      checkedLayout: Readonly<{
        layout: Readonly<{ blocks: readonly unknown[] }>;
        checkResult: Readonly<{
          kind: "babylon-native-block-profile-check-result";
          schemaVersion: 1;
          outcome: "passed" | "rejected";
        }>;
      }>;
    }>;
    dispose(): void;
  };
}

async function loadSession(): Promise<SessionModule> {
  const modulePath = ["./", "session.js"].join("");
  return import(modulePath) as Promise<SessionModule>;
}

function createContext(
  scene: Scene,
  registration?: BabylonNativeSceneBuildContextV1["registration"],
): BabylonNativeSceneBuildContextV1 {
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
    registration: registration ?? Object.freeze({
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

  it("allows Babylon-native composition before requiring an ordinary unparented final Mesh", async () => {
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

      expect(() => session.finalize({ staticColliders: [] })).toThrow(
        /WORLDKIT_NATIVE_BLOCK_VISUAL_RECORD_MISMATCH/,
      );
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

      const firstResult = session.finalize({ staticColliders: [] });
      expect(firstResult).toMatchObject({
        kind: "babylon-native-block-finalized-epoch",
        schemaVersion: 1,
        checkedLayout: {
          checkResult: {
            kind: "babylon-native-block-profile-check-result",
            schemaVersion: 1,
            outcome: "passed",
          },
        },
      });
      expect(firstResult.checkedLayout.layout.blocks).toHaveLength(1);
      expect(session.finalize({ staticColliders: [] })).toBe(firstResult);
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
      for (const [index, id] of [
        "first-block",
        "second-block",
        "third-block",
      ].entries()) {
        const mesh = session.createBlock({
          id,
          shape: "small",
          paletteRole: "ground",
        });
        mesh.position.set(index / 2 + 0.25, 0.25, 0.25);
        const dispose = mesh.dispose.bind(mesh);
        mesh.dispose = (...arguments_) => {
          disposalOrder.push(id);
          return dispose(...arguments_);
        };
      }

      session.finalize({ staticColliders: [] });
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

      const firstMesh = first.createBlock({
        id: "shared-id",
        shape: "small",
        paletteRole: "ground",
      });
      firstMesh.position.set(0.25, 0.25, 0.25);
      const secondMesh = second.createBlock({
        id: "shared-id",
        shape: "small",
        paletteRole: "ground",
      });
      secondMesh.position.set(0.25, 0.25, 0.25);
      first.finalize({ staticColliders: [] });
      expect(() => second.finalize({ staticColliders: [] })).not.toThrow();
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

  it("rejects finalize on a disposed Session before reading untrusted input", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 1 },
      );
      session.dispose();
      let wasRead = false;
      const input = Object.defineProperty({}, "staticColliders", {
        get(): never {
          wasRead = true;
          throw new Error("untrusted finalize accessor was read");
        },
      });

      expect(() => session.finalize(input as never)).toThrow(
        /WORLDKIT_NATIVE_BLOCK_SESSION_CLOSED/,
      );
      expect(wasRead).toBe(false);
    });
  });

  it("preserves a late commit error while visual, proxy, and source cleanup continues in reverse order", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const cleanupOrder: string[] = [];
      const context = createContext(scene, Object.freeze({
        registerSpawnMarker(): void {},
        registerStaticCollider(
          collider: Readonly<BabylonNativeStaticColliderV1>,
        ): void {
          const dispose = collider.mesh.dispose.bind(collider.mesh);
          collider.mesh.dispose = (
            ...arguments_: Parameters<Mesh["dispose"]>
          ) => {
            cleanupOrder.push(`proxy:${collider.id}`);
            dispose(...arguments_);
            if (collider.id === "second-collider") {
              throw new Error("proxy cleanup failed");
            }
          };
        },
      }));
      const session = createBabylonNativeBlockProfileSessionV1(
        context,
        { maximumBlockCount: 2 },
      );
      for (const [index, id] of ["first-block", "second-block"].entries()) {
        const mesh = session.createBlock({
          id,
          shape: "full",
          paletteRole: "route",
        });
        mesh.position.set(index, 0.5, 0);
        let assignedMaterial = mesh.material;
        Object.defineProperty(mesh, "material", {
          configurable: true,
          get: () => assignedMaterial,
          set: (value) => {
            assignedMaterial = value;
            if (value === null) cleanupOrder.push(`visual:${id}`);
          },
        });
        const dispose = mesh.dispose.bind(mesh);
        mesh.dispose = (...arguments_) => {
          cleanupOrder.push(`source:${id}`);
          dispose(...arguments_);
          if (id === "second-block") throw new Error("source cleanup failed");
        };
      }
      commitProfileSettlement.mockImplementationOnce(() => {
        throw new Error("late Host commit failed");
      });

      expect(() => session.finalize(Object.freeze({
        staticColliders: Object.freeze([
          Object.freeze({
            id: "first-collider",
            blockId: "first-block",
            traversalBinding: Object.freeze({ kind: "not-traversable" }),
          }),
          Object.freeze({
            id: "second-collider",
            blockId: "second-block",
            traversalBinding: Object.freeze({ kind: "not-traversable" }),
          }),
        ]),
      }))).toThrow(/late Host commit failed/);
      expect(cleanupOrder).toEqual([
        "visual:second-block",
        "visual:first-block",
        "proxy:second-collider",
        "proxy:first-collider",
        "source:second-block",
        "source:first-block",
      ]);
    });
  });
});
