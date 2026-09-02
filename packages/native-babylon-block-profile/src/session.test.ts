import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
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
      shape: "full" | "half" | "quarter" | "small" | "step";
      paletteRole:
        | "ground"
        | "route"
        | "structure"
        | "hazard"
        | "water-like-visual"
        | "background-mass";
      centerMetersXYZ: readonly [number, number, number];
      rotationQuarterTurnsY?: 0 | 1 | 2 | 3;
      visualGroupId?: string;
    }>): Mesh;
    createBlockGrid(input: Readonly<{
      idPrefix: string;
      shape: "full" | "half" | "quarter" | "small" | "step";
      paletteRole:
        | "ground"
        | "route"
        | "structure"
        | "hazard"
        | "water-like-visual"
        | "background-mass";
      minimumCenterMetersXYZ: readonly [number, number, number];
      repeatCountXYZ: readonly [number, number, number];
      rotationQuarterTurnsY?: 0 | 1 | 2 | 3;
      visualGroupId?: string;
    }>): readonly Mesh[];
    finalize(input: Readonly<{
      displayGapMeters?: number;
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
        centerMetersXYZ: [0.25, 0.25, 0],
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

  it("creates the quarter-meter step as one exact fixed Babylon Mesh", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 1 },
      );
      const mesh = session.createBlock({
        id: "route-step",
        shape: "step",
        paletteRole: "route",
        centerMetersXYZ: [0, 0.125, 0],
      });

      const extendSize = mesh.getBoundingInfo().boundingBox.extendSize;
      expect([extendSize.x * 2, extendSize.y * 2, extendSize.z * 2])
        .toEqual([1, 0.25, 1]);
    });
  });

  it("applies the declared center and quarter-turn atomically", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 2 },
      );

      const unrotated = session.createBlock({
        id: "unrotated-quarter",
        shape: "quarter",
        paletteRole: "structure",
        visualGroupId: "ridge",
        centerMetersXYZ: [-0.25, 0.25, 0],
      });
      const rotated = session.createBlock({
        id: "rotated-quarter",
        shape: "quarter",
        paletteRole: "structure",
        visualGroupId: "ridge",
        centerMetersXYZ: [0.5, 0.25, 0.25],
        rotationQuarterTurnsY: 1,
      });

      expect(unrotated.position.asArray()).toEqual([-0.25, 0.25, 0]);
      expect(unrotated.rotation.y).toBe(0);
      expect(rotated.position.asArray()).toEqual([0.5, 0.25, 0.25]);
      expect(rotated.rotation.y).toBeCloseTo(Math.PI / 2, 12);

      const epoch = session.finalize({ staticColliders: [] });
      expect(epoch.checkedLayout.layout.blocks).toEqual([
        expect.objectContaining({
          id: "rotated-quarter",
          rotationQuarterTurnsY: 1,
          centerMetersXYZ: [0.5, 0.25, 0.25],
          sizeMetersXYZ: [1, 0.5, 0.5],
        }),
        expect.objectContaining({
          id: "unrotated-quarter",
          rotationQuarterTurnsY: 0,
          centerMetersXYZ: [-0.25, 0.25, 0],
          sizeMetersXYZ: [0.5, 0.5, 1],
        }),
      ]);
    });
  });

  it("rejects every invalid placement before allocating a Mesh", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 8 },
      );
      const initialMeshCount = scene.meshes.length;
      const sparseCenter = [0, 0.5] as unknown[];
      sparseCenter[3] = 0;
      const accessorCenter: unknown[] = [0, 0];
      Object.defineProperty(accessorCenter, "2", { enumerable: true, get: () => 0 });

      for (const centerMetersXYZ of [
        undefined,
        [0, 0.5],
        [0, 0.5, 0, 0],
        [0, 0.5, Number.NaN],
        [0, 0.5, Number.POSITIVE_INFINITY],
        ["0", 0.5, 0],
        sparseCenter,
        accessorCenter,
        // 0.3 is not on the 0.25 m X center lattice.
        [0.3, 0.5, 0],
        // A full block centered on 0.25 leaves its bounds off the 0.5 m grid.
        [0.25, 0.5, 0],
      ]) {
        expect(() => session.createBlock({
          id: "candidate-block",
          shape: "full",
          paletteRole: "ground",
          ...(centerMetersXYZ === undefined ? {} : { centerMetersXYZ }),
        } as never)).toThrow(/WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID/);
      }

      for (const rotationQuarterTurnsY of [4, -1, 1.5, "1", Number.NaN]) {
        expect(() => session.createBlock({
          id: "candidate-block",
          shape: "full",
          paletteRole: "ground",
          centerMetersXYZ: [0, 0.5, 0],
          rotationQuarterTurnsY,
        } as never)).toThrow(/WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID/);
      }

      expect(scene.meshes).toHaveLength(initialMeshCount);
    });
  });

  it("rejects an occupied cell without allocating a Mesh", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 4 },
      );
      session.createBlock({
        id: "ground-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      });
      const occupiedMeshCount = scene.meshes.length;

      expect(() => session.createBlock({
        id: "overlapping-block",
        shape: "small",
        paletteRole: "structure",
        centerMetersXYZ: [0.25, 0.25, 0.25],
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP/);
      expect(scene.meshes).toHaveLength(occupiedMeshCount);

      expect(() => session.createBlock({
        id: "adjacent-block",
        shape: "small",
        paletteRole: "structure",
        centerMetersXYZ: [0.75, 1.25, 0.25],
      })).not.toThrow();
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
        centerMetersXYZ: [0, 0.5, 1],
      });

      mesh.parent = root;
      mesh.material = material;

      expect(mesh.parent).toBe(root);
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
        centerMetersXYZ: [0, 0.5, 0],
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
      const centerMetersXYZ = [0, 0.5, 0] as const;
      const invalid = [
        { id: " A ", shape: "full", paletteRole: "ground", centerMetersXYZ },
        { id: "valid-id", shape: "cube", paletteRole: "ground", centerMetersXYZ },
        { id: "valid-id", shape: "full", paletteRole: "decoration", centerMetersXYZ },
        { id: "valid-id", shape: "full", paletteRole: "ground", centerMetersXYZ, legacy: true },
        {
          id: "valid-id",
          shape: "full",
          paletteRole: "structure",
          centerMetersXYZ,
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
        centerMetersXYZ,
      });
      expect(() => session.createBlock({
        id: "stable-id",
        shape: "small",
        paletteRole: "route",
        centerMetersXYZ: [2.25, 0.25, 0.25],
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
        centerMetersXYZ: [0, 0.5, 0],
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
        centerMetersXYZ: [2, 0.5, 0],
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_SESSION_CLOSED/);
      expect(() => session.createBlockGrid({
        idPrefix: "late-grid",
        shape: "full",
        paletteRole: "ground",
        minimumCenterMetersXYZ: [4, 0.5, 0],
        repeatCountXYZ: [1, 1, 1],
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
          centerMetersXYZ: [index / 2 + 0.25, 0.25, 0.25],
        });
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
        centerMetersXYZ: [8, 0.5, 0],
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

      first.createBlock({
        id: "shared-id",
        shape: "small",
        paletteRole: "ground",
        centerMetersXYZ: [0.25, 0.25, 0.25],
      });
      second.createBlock({
        id: "shared-id",
        shape: "small",
        paletteRole: "ground",
        centerMetersXYZ: [0.25, 0.25, 0.25],
      });
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

  it("validates display gap against the actual Layout before any side effect", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const registeredColliders: BabylonNativeStaticColliderV1[] = [];
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene, Object.freeze({
          registerSpawnMarker(): void {},
          registerStaticCollider(
            collider: Readonly<BabylonNativeStaticColliderV1>,
          ): void {
            registeredColliders.push(collider);
          },
        })),
        { maximumBlockCount: 1 },
      );
      session.createBlock({
        id: "route-step",
        shape: "step",
        paletteRole: "route",
        centerMetersXYZ: [0, 0.125, 0],
      });

      expect(() => session.finalize(Object.freeze({
        displayGapMeters: 0.25,
        staticColliders: Object.freeze([Object.freeze({
          id: "route-step-collider",
          blockId: "route-step",
          traversalBinding: Object.freeze({ kind: "not-traversable" }),
        })]),
      }))).toThrow(/WORLDKIT_NATIVE_BLOCK_FINALIZE_INPUT_INVALID/);
      expect(registeredColliders).toEqual([]);
      expect(scene.materials).toEqual([]);
      expect(commitProfileSettlement).not.toHaveBeenCalled();
    });
  });

  it("allows a display gap larger than the step height when the Layout uses only full blocks", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 1 },
      );
      const full = session.createBlock({
        id: "full-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      });

      expect(() => session.finalize(Object.freeze({
        displayGapMeters: 0.6,
        staticColliders: Object.freeze([]),
      }))).not.toThrow();
      expect(full.scaling.asArray()).toEqual([0.4, 0.4, 0.4]);
      expect(commitProfileSettlement).toHaveBeenCalledTimes(1);
    });
  });

  it("derives grid IDs, spacing, and Y/Z/X order from the selected shape", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 8 },
      );

      const meshes = session.createBlockGrid({
        idPrefix: "entry-ground",
        shape: "full",
        paletteRole: "ground",
        visualGroupId: "entry-ground-group",
        minimumCenterMetersXYZ: [0, 0.5, 0],
        repeatCountXYZ: [2, 2, 2],
      });

      expect(meshes.map((mesh) => mesh.id)).toEqual([
        "entry-ground-x0-y0-z0",
        "entry-ground-x1-y0-z0",
        "entry-ground-x0-y0-z1",
        "entry-ground-x1-y0-z1",
        "entry-ground-x0-y1-z0",
        "entry-ground-x1-y1-z0",
        "entry-ground-x0-y1-z1",
        "entry-ground-x1-y1-z1",
      ]);
      expect(meshes.map((mesh) => mesh.position.asArray())).toEqual([
        [0, 0.5, 0], [1, 0.5, 0], [0, 0.5, 1], [1, 0.5, 1],
        [0, 1.5, 0], [1, 1.5, 0], [0, 1.5, 1], [1, 1.5, 1],
      ]);
    });
  });

  it("spaces a rotated quarter grid by its effective rotated size", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 4 },
      );

      const unrotated = session.createBlockGrid({
        idPrefix: "unrotated-quarter",
        shape: "quarter",
        paletteRole: "structure",
        minimumCenterMetersXYZ: [-4.25, 0.25, 0],
        repeatCountXYZ: [2, 1, 1],
      });
      const rotated = session.createBlockGrid({
        idPrefix: "rotated-quarter",
        shape: "quarter",
        paletteRole: "structure",
        minimumCenterMetersXYZ: [0.5, 0.25, 0.25],
        repeatCountXYZ: [2, 1, 1],
        rotationQuarterTurnsY: 1,
      });

      expect(unrotated.map((mesh) => mesh.position.asArray()))
        .toEqual([[-4.25, 0.25, 0], [-3.75, 0.25, 0]]);
      expect(rotated.map((mesh) => mesh.position.asArray()))
        .toEqual([[0.5, 0.25, 0.25], [1.5, 0.25, 0.25]]);
      expect(rotated.every((mesh) => Math.abs(mesh.rotation.y - Math.PI / 2) < 1e-12))
        .toBe(true);
    });
  });

  it("creates zero Meshes for any grid preflight rejection", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 4 },
      );
      const base = Object.freeze({
        idPrefix: "entry-ground",
        shape: "full" as const,
        paletteRole: "ground" as const,
        minimumCenterMetersXYZ: [0, 0.5, 0] as const,
        repeatCountXYZ: [1, 1, 1] as const,
      });
      const initialMeshCount = scene.meshes.length;

      for (const override of [
        { idPrefix: "Bad Prefix" },
        { idPrefix: "" },
        { repeatCountXYZ: [0, 1, 1] },
        { repeatCountXYZ: [-1, 1, 1] },
        { repeatCountXYZ: [1.5, 1, 1] },
        { repeatCountXYZ: [1, 1] },
        { repeatCountXYZ: [1, 1, 1, 1] },
        // The product overflows the safe-integer range before allocation.
        { repeatCountXYZ: [2 ** 40, 2 ** 40, 2 ** 40] },
        { minimumCenterMetersXYZ: [0.3, 0.5, 0] },
        { minimumCenterMetersXYZ: [0, Number.NaN, 0] },
        { rotationQuarterTurnsY: 4 },
        { unknownField: true },
        // The whole batch exceeds the Session budget.
        { repeatCountXYZ: [5, 1, 1] },
      ]) {
        expect(() => session.createBlockGrid({
          ...base,
          ...override,
        } as never)).toThrow(/WORLDKIT_NATIVE_BLOCK_/);
        expect(scene.meshes, JSON.stringify(override))
          .toHaveLength(initialMeshCount);
      }
    });
  });

  it("rejects a grid conflicting with existing IDs or cells without allocating", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 8 },
      );
      session.createBlock({
        id: "entry-ground-x0-y0-z0",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [10, 0.5, 0],
      });
      const occupiedMeshCount = scene.meshes.length;

      expect(() => session.createBlockGrid({
        idPrefix: "entry-ground",
        shape: "full",
        paletteRole: "ground",
        minimumCenterMetersXYZ: [0, 0.5, 0],
        repeatCountXYZ: [1, 1, 1],
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_ID_DUPLICATE/);
      expect(scene.meshes).toHaveLength(occupiedMeshCount);

      expect(() => session.createBlockGrid({
        idPrefix: "overlapping-ground",
        shape: "full",
        paletteRole: "ground",
        minimumCenterMetersXYZ: [10, 0.5, 0],
        repeatCountXYZ: [1, 1, 1],
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP/);
      expect(scene.meshes).toHaveLength(occupiedMeshCount);
    });
  });

  it("disposes a partially built grid in reverse and leaves the Session reusable", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 8 },
      );
      const initialMeshCount = scene.meshes.length;
      const disposalOrder: string[] = [];
      let createdCount = 0;
      const createBox = MeshBuilder.CreateBox;
      const spy = vi.spyOn(MeshBuilder, "CreateBox").mockImplementation(
        ((name: string, options: never, target: never) => {
          createdCount += 1;
          if (createdCount === 3) throw new Error("mid-batch mesh failure");
          const mesh = createBox(name, options, target);
          const dispose = mesh.dispose.bind(mesh);
          mesh.dispose = (...arguments_) => {
            disposalOrder.push(name);
            return dispose(...arguments_);
          };
          return mesh;
        }) as never,
      );

      try {
        expect(() => session.createBlockGrid({
          idPrefix: "entry-ground",
          shape: "full",
          paletteRole: "ground",
          minimumCenterMetersXYZ: [0, 0.5, 0],
          repeatCountXYZ: [4, 1, 1],
        })).toThrow(/mid-batch mesh failure/);
      } finally {
        spy.mockRestore();
      }

      expect(disposalOrder).toEqual([
        "entry-ground-x1-y0-z0",
        "entry-ground-x0-y0-z0",
      ]);
      expect(scene.meshes).toHaveLength(initialMeshCount);
      expect(() => session.createBlockGrid({
        idPrefix: "entry-ground",
        shape: "full",
        paletteRole: "ground",
        minimumCenterMetersXYZ: [0, 0.5, 0],
        repeatCountXYZ: [2, 1, 1],
      })).not.toThrow();
    });
  });

  it("gives a one-cell grid the same checked identity as a single block", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    function checkedBlocks(
      build: (session: ReturnType<
        SessionModule["createBabylonNativeBlockProfileSessionV1"]
      >) => void,
    ): readonly unknown[] {
      let blocks: readonly unknown[] = [];
      withScene((scene) => {
        const session = createBabylonNativeBlockProfileSessionV1(
          createContext(scene),
          { maximumBlockCount: 1 },
        );
        build(session);
        blocks = session.finalize({ staticColliders: [] })
          .checkedLayout.layout.blocks
          .map((block) => ({
            ...(block as Record<string, unknown>),
            id: "normalized-id",
          }));
      });
      return blocks;
    }

    const single = checkedBlocks((session) => {
      session.createBlock({
        id: "entry-ground",
        shape: "quarter",
        paletteRole: "ground",
        visualGroupId: "entry-ground-group",
        centerMetersXYZ: [0.5, 0.25, 0.25],
        rotationQuarterTurnsY: 1,
      });
    });
    const grid = checkedBlocks((session) => {
      session.createBlockGrid({
        idPrefix: "entry-ground",
        shape: "quarter",
        paletteRole: "ground",
        visualGroupId: "entry-ground-group",
        minimumCenterMetersXYZ: [0.5, 0.25, 0.25],
        repeatCountXYZ: [1, 1, 1],
        rotationQuarterTurnsY: 1,
      });
    });

    expect(grid).toEqual(single);
  });

  it("never creates Collider intent from a grid", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const registeredColliders: BabylonNativeStaticColliderV1[] = [];
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene, Object.freeze({
          registerSpawnMarker(): void {},
          registerStaticCollider(
            collider: Readonly<BabylonNativeStaticColliderV1>,
          ): void {
            registeredColliders.push(collider);
          },
        })),
        { maximumBlockCount: 4 },
      );

      session.createBlockGrid({
        idPrefix: "entry-ground",
        shape: "full",
        paletteRole: "ground",
        minimumCenterMetersXYZ: [0, 0.5, 0],
        repeatCountXYZ: [2, 1, 1],
      });
      session.finalize({ staticColliders: [] });

      expect(registeredColliders).toEqual([]);
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
          centerMetersXYZ: [index, 0.5, 0],
        });
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
