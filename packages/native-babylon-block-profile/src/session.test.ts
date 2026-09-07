import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  createBabylonNativeHostRandomV1,
  type BabylonNativeSceneBuildContextV1,
  type BabylonNativeStaticColliderV1,
} from "@whitebox-world/native-babylon";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { takeBabylonNativeBlockCheckedEpochEvidenceV1 } from
  "./host-evidence.js";
import { peekBabylonNativeBlockLiveHandleRegistryV1 } from "./live-handle-registry.js";
import { materializeBabylonNativeBlockVisualBatchesV1 } from "./visual-batch-materializer.js";
import { BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1 } from "./chunk-policy.js";

const commitProfileSettlement = vi.hoisted(() => vi.fn());
vi.mock("@whitebox-world/native-babylon/host", () => ({
  commitBabylonNativeProfileSettlementV1: commitProfileSettlement,
  createBabylonNativeBlockProfileBuildFailureV1(
    code: string,
    detail: string,
  ) {
    return new TypeError(`${code}: ${detail}`);
  },
}));

beforeEach(() => {
  commitProfileSettlement.mockReset();
  commitProfileSettlement.mockImplementation(() => {});
});

type SessionModule = typeof import("./session.js");

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

function hostPublishableFailure(run: () => void): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(TypeError);
    const message = (error as TypeError).message;
    expect(message).toMatch(/^(WORLDKIT_NATIVE_BLOCK_[A-Z0-9_]+): [^\n]+$/);
    expect(message).not.toMatch(/\n|\bat\s+\S+\s+\(|Error:/);
    return message;
  }
  throw new Error("expected a Host-publishable Block Profile failure");
}

describe("Babylon Native block profile session", () => {
  it("CF-20/MEM4 records immutable intent without allocating per-Block Meshes", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await import("./session.js");
    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(createContext(scene));
      const allocations = vi.spyOn(MeshBuilder, "CreateBox");
      try {
        const blocks = session.createBlockGrid({ idPrefix: "intent", shape: "full",
          paletteRole: "background-mass", minimumCenterMetersXYZ: [0, -0.5, 0],
          repeatCountXYZ: [30, 3, 90] });
        expect(blocks).toHaveLength(8100);
        expect(scene.meshes).toHaveLength(0);
        expect(allocations).not.toHaveBeenCalled();
        expect(Object.isFrozen(blocks)).toBe(true);
        expect(Object.isFrozen(blocks[0])).toBe(true);
      } finally {
        allocations.mockRestore();
        session.dispose();
      }
    });
  });

  it("CF-20/MEM4 materializes one legacy cluster while preserving every logical Block", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await import("./session.js");
    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(createContext(scene));
      session.createBlockGrid({ idPrefix: "cluster", shape: "full",
        paletteRole: "background-mass", minimumCenterMetersXYZ: [0, -0.5, 0],
        repeatCountXYZ: [8, 1, 1] });
      const epoch = session.finalize({ staticColliders: [] });
      expect(epoch.checkedLayout.layout.blocks).toHaveLength(8);
      expect(scene.meshes).toHaveLength(1);
      expect(peekBabylonNativeBlockLiveHandleRegistryV1(scene)?.blocks).toHaveLength(8);
      session.dispose();
      expect(scene.meshes).toHaveLength(0);
    });
  });

  it.each([
    ["full", [0, 0.5, 0], [1, 1, 1]],
    ["half", [0, 0.25, 0], [1, 0.5, 1]],
    ["quarter", [0.25, 0.25, 0], [0.5, 0.5, 1]],
    ["small", [0.25, 0.25, 0.25], [0.5, 0.5, 0.5]],
  ] as const)("materializes exact %s metric intent with the fixed display scale", async (shape, center, size) => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();
    withScene(scene => {
      const session = createBabylonNativeBlockProfileSessionV1(createContext(scene));
      const block = session.createBlock({ id: "shape-block", shape,
        paletteRole: "ground", centerMetersXYZ: center });
      expect(block).not.toBeInstanceOf(Mesh);
      expect(Object.isFrozen(block.centerMetersXYZ)).toBe(true);
      expect(scene.meshes).toHaveLength(0);
      const epoch = session.finalize({ staticColliders: [] });
      expect(epoch.checkedLayout.layout.blocks[0]!.sizeMetersXYZ).toEqual(size);
      const mesh = scene.meshes[0]!;
      expect(mesh.position.asArray()).toEqual(center);
      expect(mesh.scaling.asArray()).toEqual(size.map(value => value * 0.985));
      session.dispose();
      expect(scene.meshes).toHaveLength(0);
    });
  });

  it("keeps independently owned cluster and Runtime batch geometries across scenes", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();
    withScene(scene => {
      const session = createBabylonNativeBlockProfileSessionV1(createContext(scene));
      for (const x of [0, 2, 40, 42]) session.createBlock({ id: `block-${x}`,
        shape: "full", paletteRole: "background-mass", centerMetersXYZ: [x, 0.5, 0] });
      const epoch = session.finalize({ staticColliders: [] });
      const originals = [...scene.meshes] as Mesh[];
      const batches = materializeBabylonNativeBlockVisualBatchesV1({
        scene, realizationId: "ownership-test",
        chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
        liveHandles: peekBabylonNativeBlockLiveHandleRegistryV1(scene)!,
        placements: epoch.checkedLayout.layout.blocks.map(block => ({
          ...block, blockId: block.id, runtimeEntityId: `native-block:${block.id}`,
          semanticCaptureClassId: "worldkit.native-block.group.ungrouped",
        })),
      });
      expect(batches.batches).toHaveLength(2);
      const displays = batches.batches.map(batch => batch.mesh);
      expect(new Set(displays.map(mesh => mesh.geometry)).size).toBe(2);
      for (const mesh of displays) for (const raw of originals) expect(mesh.geometry).not.toBe(raw.geometry);
      batches.dispose();
      expect(originals.every(mesh => mesh.isVisible)).toBe(true);
      session.dispose();
      expect(scene.meshes).toHaveLength(0);
    });
  });

  it("applies the declared center and quarter-turn atomically", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
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

      expect(unrotated.centerMetersXYZ).toEqual([-0.25, 0.25, 0]);
      expect((unrotated.rotationQuarterTurnsY ?? 0) * Math.PI / 2).toBe(0);
      expect(rotated.centerMetersXYZ).toEqual([0.5, 0.25, 0.25]);
      expect((rotated.rotationQuarterTurnsY ?? 0) * Math.PI / 2).toBeCloseTo(Math.PI / 2, 12);

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

  it("canonicalizes an accepted near-lattice center before creation and finalization", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
      );
      const mesh = session.createBlock({
        id: "near-lattice-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0.5000000001, 0.5, 0.5],
      });

      expect(mesh.centerMetersXYZ).toEqual([0.5, 0.5, 0.5]);
      expect(session.finalize({ staticColliders: [] })
        .checkedLayout.layout.blocks[0]).toEqual(expect.objectContaining({
        id: "near-lattice-block",
        centerMetersXYZ: [0.5, 0.5, 0.5],
      }));
    });
  });

  it("rejects every invalid placement before allocating a Mesh", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
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

  it("returns closed immutable intent, not a mutable Babylon placement dialect", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();
    withScene(scene => {
      const session = createBabylonNativeBlockProfileSessionV1(createContext(scene));
      const center: [number, number, number] = [0, 0.5, 0];
      const source = { id: "immutable", shape: "full" as const, paletteRole: "ground" as const,
        centerMetersXYZ: center };
      const intent = session.createBlock(source);
      center[0] = 20;
      source.id = "changed";
      expect(() => Reflect.set(intent, "position", {})).not.toThrow();
      expect(Reflect.set(intent, "id", "changed")).toBe(false);
      expect(intent).not.toHaveProperty("position");
      expect(session.finalize({ staticColliders: [] }).checkedLayout.layout.blocks[0])
        .toMatchObject({ id: "immutable", centerMetersXYZ: [0, 0.5, 0] });
    });
  });

  it("creates more than the retired production cap without a caller budget", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();
    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(createContext(scene));
      try {
        const meshes = session.createBlockGrid({
          idPrefix: "complete-world", shape: "full", paletteRole: "ground",
          minimumCenterMetersXYZ: [0, -0.5, 0], repeatCountXYZ: [81, 1, 100],
        });
        expect(meshes).toHaveLength(8_100);
        expect(new Set(meshes.map((mesh) => mesh.id)).size).toBe(8_100);
      } finally { session.dispose(); }
    });
  });

  it("enforces the selected Profile", async () => {
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
      )).toThrow(/WORLDKIT_NATIVE_BLOCK_PROFILE_MISMATCH/);
    });
  });

  it("rejects invalid create inputs and duplicate session IDs", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
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

  it("disposes materialized clusters in reverse order exactly once", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();
    withScene(scene => {
      const session = createBabylonNativeBlockProfileSessionV1(createContext(scene));
      for (const x of [0, 2, 4]) session.createBlock({ id: `block-${x}`, shape: "full",
        paletteRole: "ground", centerMetersXYZ: [x, 0.5, 0] });
      session.finalize({ staticColliders: [] });
      const meshes = [...scene.meshes];
      const order: string[] = [];
      for (const mesh of meshes) {
        const dispose = mesh.dispose.bind(mesh);
        mesh.dispose = (...args) => { order.push(mesh.name); dispose(...args); };
      }
      session.dispose();
      session.dispose();
      expect(order).toEqual(meshes.map(mesh => mesh.name).reverse());
      expect(scene.meshes).toHaveLength(0);
    });
  });

  it("isolates IDs and lifecycle across sessions", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const context = createContext(scene);
      const first = createBabylonNativeBlockProfileSessionV1(
        context,
      );
      const second = createBabylonNativeBlockProfileSessionV1(
        context,
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

  it("rejects the removed quarter-height step shape before creating geometry", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();
    withScene(scene => {
      const session = createBabylonNativeBlockProfileSessionV1(createContext(scene));
      expect(() => session.createBlock({
        id: "removed-step",
        // @ts-expect-error Deliberately exercise untrusted removed input.
        shape: "step",
        paletteRole: "route",
        centerMetersXYZ: [0, 0.125, 0],
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID/);
      expect(scene.meshes).toHaveLength(0);
    });
  });

  it("rejects the removed display-gap override before any side effect", async () => {
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
      );
      session.createBlock({
        id: "route-step",
        shape: "half",
        paletteRole: "route",
        centerMetersXYZ: [0, 0.25, 0],
      });

      expect(() => session.finalize(Object.freeze({
        displayGapMeters: 0.25,
        staticColliders: Object.freeze([Object.freeze({
          id: "route-step-collider",
          colliderGeometrySource: Object.freeze({ kind: "block" as const, blockId: "route-step" }),
          traversalBinding: Object.freeze({ kind: "not-traversable" }),
          exposedEdgePolicy: "none" as const,
        })]),
      }))).toThrow(/WORLDKIT_NATIVE_BLOCK_FINALIZE_INPUT_INVALID/);
      expect(registeredColliders).toEqual([]);
      expect(scene.materials).toEqual([]);
      expect(commitProfileSettlement).not.toHaveBeenCalled();
    });
  });

  it("rejects per-scene scale overrides instead of silently changing the fixed display", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
      );
      const full = session.createBlock({
        id: "full-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      });

      expect(() => session.finalize(Object.freeze({
        displayScaleRatio: 0.4,
        staticColliders: Object.freeze([]),
      }))).toThrow(/WORLDKIT_NATIVE_BLOCK_FINALIZE_INPUT_INVALID/);
      expect(full).not.toHaveProperty("scaling");
      expect(scene.meshes).toHaveLength(0);
      expect(commitProfileSettlement).not.toHaveBeenCalled();
    });
  });

  it("keeps fail() messages in the Host-publishable TypeError dialect", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
      );
      expect(hostPublishableFailure(() => {
        session.createBlock({
          id: "central-step",
          shape: "half",
          paletteRole: "route",
          centerMetersXYZ: [0, 0.1, 0],
        });
      })).toMatch(/^WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID: /);
    });

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
      );
      session.createBlock({
        id: "ground-a",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, -0.5, 0],
      });
      expect(hostPublishableFailure(() => {
        session.createBlock({
          id: "ground-b",
          shape: "full",
          paletteRole: "ground",
          centerMetersXYZ: [0, -0.5, 0],
        });
      })).toMatch(/^WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP: /);
    });
  });

  it("finalizes multiple route components without treating palette topology as blocking", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
      );
      session.createBlock({
        id: "west-route",
        shape: "full",
        paletteRole: "route",
        centerMetersXYZ: [0, -0.5, 0],
      });
      session.createBlock({
        id: "ordinary-ground",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [1, -0.5, 0],
      });
      session.createBlock({
        id: "east-route",
        shape: "full",
        paletteRole: "route",
        centerMetersXYZ: [2, -0.5, 0],
      });
      const epoch = session.finalize({ staticColliders: [] });
      expect(epoch.checkedLayout.checkResult.outcome).toBe("passed");
    });
  });

  it("freezes returned intent placement and preserves its canonical layout", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();
    withScene(scene => {
      const session = createBabylonNativeBlockProfileSessionV1(createContext(scene));
      const intent = session.createBlock({ id: "ground-block", shape: "quarter",
        paletteRole: "ground", centerMetersXYZ: [0.25, 0.25, 0] });
      expect(Reflect.set(intent.centerMetersXYZ, "0", 3)).toBe(false);
      expect(Reflect.set(intent, "rotationQuarterTurnsY", 1)).toBe(false);
      expect(session.finalize({ staticColliders: [] }).checkedLayout.layout.blocks[0])
        .toMatchObject({ centerMetersXYZ: [0.25, 0.25, 0], rotationQuarterTurnsY: 0 });
    });
  });

  it("derives grid IDs, spacing, and Y/Z/X order from the selected shape", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
      );

      const meshes = session.createBlockGrid({
        idPrefix: "entry-ground",
        shape: "full",
        paletteRole: "ground",
        visualGroupId: "entry-ground-group",
        colliderGroupId: "entry-ground-colliders",
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
      expect(meshes.map((mesh) => mesh.centerMetersXYZ)).toEqual([
        [0, 0.5, 0], [1, 0.5, 0], [0, 0.5, 1], [1, 0.5, 1],
        [0, 1.5, 0], [1, 1.5, 0], [0, 1.5, 1], [1, 1.5, 1],
      ]);
      const epoch = session.finalize({ staticColliders: [] });
      expect(epoch.checkedLayout.layout.blocks.map((block) =>
        block.colliderGroupId)).toEqual(Array(8).fill("entry-ground-colliders"));
    });
  });

  it("rejects invalid Collider Group identity before allocating a Mesh", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
      );
      const initialMeshCount = scene.meshes.length;
      expect(() => session.createBlock({
        id: "ground-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
        colliderGroupId: "Ground Group",
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID/);
      expect(scene.meshes.length).toBe(initialMeshCount);
    });
  });

  it("rejects the retired Collider blockId shape and invalid edge policy before contribution", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();
    const invalidSelections = [
      Object.freeze({
        id: "ground-collider",
        colliderGeometrySource: Object.freeze({
          kind: "block" as const,
          blockId: "ground-block",
        }),
        traversalBinding: Object.freeze({
          kind: "static-surface" as const,
          surfaceEntityId: "ground-surface",
          logicalSubshapeId: "top",
          traversalSurfaceProfileRef:
            "worldkit://traversal-surface-profile/ground.static@1",
        }),
      }),
      Object.freeze({
        id: "ground-collider",
        blockId: "ground-block",
        traversalBinding: Object.freeze({ kind: "not-traversable" as const }),
        exposedEdgePolicy: "none" as const,
      }),
      Object.freeze({
        id: "ground-collider",
        colliderGeometrySource: Object.freeze({
          kind: "block" as const,
          blockId: "ground-block",
        }),
        traversalBinding: Object.freeze({ kind: "not-traversable" as const }),
        exposedEdgePolicy: "protect-ground-subject" as const,
      }),
    ];

    for (const selection of invalidSelections) {
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
        );
        session.createBlock({
          id: "ground-block",
          shape: "full",
          paletteRole: "ground",
          centerMetersXYZ: [0, 0.5, 0],
        });

        expect(() => session.finalize({
          staticColliders: [selection],
        } as never)).toThrow(/WORLDKIT_NATIVE_BLOCK_COLLIDER_SELECTION_INVALID/);
        expect(registeredColliders).toEqual([]);
        expect(commitProfileSettlement).not.toHaveBeenCalled();
      });
    }
  });

  it("publishes ground protection only through trusted Host evidence", async () => {
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
      );
      session.createBlock({
        id: "ground-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      });

      expect(() => session.finalize({
        staticColliders: [Object.freeze({
          id: "ground-collider",
          colliderGeometrySource: Object.freeze({
            kind: "block" as const,
            blockId: "ground-block",
          }),
          traversalBinding: Object.freeze({
            kind: "static-surface" as const,
            surfaceEntityId: "ground-surface",
            logicalSubshapeId: "top",
            traversalSurfaceProfileRef:
              "worldkit://traversal-surface-profile/ground.static@1",
          }),
          exposedEdgePolicy: "protect-ground-subject" as const,
        })],
      } as never)).not.toThrow();
      expect(registeredColliders.map(({ id }) => id)).toEqual([
        "ground-collider",
      ]);
      const evidence = takeBabylonNativeBlockCheckedEpochEvidenceV1(scene);
      expect(evidence).toHaveLength(1);
      expect(evidence[0]?.groundBoundaryContribution).toMatchObject({
        runtimeRole: "ground-safety-boundary",
        traversalBinding: { kind: "not-traversable" },
      });
      expect(commitProfileSettlement).toHaveBeenCalledTimes(1);
    });
  });

  it("allows an intentional fall only through an explicit edge-policy opt-out", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
      );
      session.createBlock({
        id: "ledge-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      });

      expect(() => session.finalize({
        staticColliders: [Object.freeze({
          id: "ledge-collider",
          colliderGeometrySource: Object.freeze({
            kind: "block" as const,
            blockId: "ledge-block",
          }),
          traversalBinding: Object.freeze({
            kind: "static-surface" as const,
            surfaceEntityId: "ledge-surface",
            logicalSubshapeId: "top",
            traversalSurfaceProfileRef:
              "worldkit://traversal-surface-profile/ground.static@1",
          }),
          exposedEdgePolicy: "none" as const,
        })],
      })).not.toThrow();
      const evidence = takeBabylonNativeBlockCheckedEpochEvidenceV1(scene);
      expect(evidence).toHaveLength(1);
      expect(evidence[0]?.groundBoundary.triangleCount).toBe(0);
      expect(evidence[0]?.groundBoundaryContribution).toBeUndefined();
    });
  });

  it("realizes a closed Collider Group as one continuous topology Collider", async () => {
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
      );
      session.createBlock({
        id: "ground-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
        colliderGroupId: "ground-collider-group",
      });

      expect(() => session.finalize({
        staticColliders: [Object.freeze({
          id: "ground-collider",
          colliderGeometrySource: Object.freeze({
            kind: "block-group" as const,
            colliderGroupId: "ground-collider-group",
          }),
          traversalBinding: Object.freeze({
            kind: "static-surface" as const,
            surfaceEntityId: "ground-surface",
            logicalSubshapeId: "top",
            traversalSurfaceProfileRef:
              "worldkit://traversal-surface-profile/ground.static@1",
          }),
          exposedEdgePolicy: "none" as const,
        })],
      } as never)).not.toThrow();
      expect(registeredColliders.map(({ id }) => id)).toEqual([
        "ground-collider",
      ]);
      expect(commitProfileSettlement).toHaveBeenCalledTimes(1);
      expect(() => session.createBlock({
        id: "late-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_SESSION_CLOSED/);
    });
  });

  it("spaces a rotated quarter grid by its effective rotated size", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
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

      expect(unrotated.map((mesh) => mesh.centerMetersXYZ))
        .toEqual([[-4.25, 0.25, 0], [-3.75, 0.25, 0]]);
      expect(rotated.map((mesh) => mesh.centerMetersXYZ))
        .toEqual([[0.5, 0.25, 0.25], [1.5, 0.25, 0.25]]);
      expect(rotated.every((mesh) => Math.abs((mesh.rotationQuarterTurnsY ?? 0) * Math.PI / 2 - Math.PI / 2) < 1e-12))
        .toBe(true);
    });
  });

  it("creates zero Meshes for any grid preflight rejection", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
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
      ]) {
        expect(() => session.createBlockGrid({
          ...base,
          ...override,
        } as never)).toThrow(/WORLDKIT_NATIVE_BLOCK_/);
        expect(scene.meshes, JSON.stringify(override))
          .toHaveLength(initialMeshCount);
      }

      expect(() => session.createBlockGrid({
        idPrefix: "a".repeat(80),
        shape: "full",
        paletteRole: "ground",
        minimumCenterMetersXYZ: [0, 0.5, 0],
        repeatCountXYZ: [1, 1, 1],
      })).toThrow(
        /WORLDKIT_NATIVE_BLOCK_GRID_CREATE_INPUT_INVALID: derived Block id/,
      );
      expect(() => session.createBlockGrid({
        ...base,
        repeatCountXYZ: [1, 1] as never,
      })).toThrow(
        /WORLDKIT_NATIVE_BLOCK_GRID_CREATE_INPUT_INVALID: repeatCountXYZ must be one ordinary dense XYZ tuple/,
      );
      expect(scene.meshes).toHaveLength(initialMeshCount);
    });
  });

  it("rejects a grid conflicting with existing IDs or cells without allocating", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
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

  it.each([false, true])("rolls back partial clustered allocation and retains its primary error (throwing cleanup: %s)", async (throwsOnCleanup) => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();
    withScene(scene => {
      const prior = MeshBuilder.CreateBox("prior", {}, scene);
      const session = createBabylonNativeBlockProfileSessionV1(createContext(scene));
      for (const x of [0, 2, 4]) session.createBlock({ id: `block-${x}`, shape: "full",
        paletteRole: "background-mass", centerMetersXYZ: [x, 0.5, 0] });
      const createBox = MeshBuilder.CreateBox;
      let count = 0;
      const cleanup: string[] = [];
      let unrelated: ReturnType<typeof MeshBuilder.CreateBox> | undefined;
      const observerCount = scene.onNewMeshAddedObservable.observers.length;
      if (throwsOnCleanup) Object.defineProperty(scene, "addMesh", {
        value: scene.addMesh.bind(scene), configurable: true, writable: true, enumerable: true,
      });
      const addMeshDescriptor = Object.getOwnPropertyDescriptor(scene, "addMesh");
      const spy = vi.spyOn(MeshBuilder, "CreateBox").mockImplementation((...args) => {
        const mesh = createBox(...args);
        const getVerticesData = mesh.getVerticesData.bind(mesh);
        mesh.getVerticesData = (...readArgs) => {
          // A caller side effect after allocation is not owned by the adapter.
          unrelated ??= createBox("unrelated-after-allocation", {}, scene);
          return getVerticesData(...readArgs);
        };
        const dispose = mesh.dispose.bind(mesh);
        mesh.dispose = (...disposeArgs) => {
          cleanup.push(mesh.name); dispose(...disposeArgs);
          if (throwsOnCleanup) throw new Error("secondary cleanup error");
        };
        if (++count === 3) throw new Error("primary allocation error");
        return mesh;
      });
      try {
        expect(() => session.finalize({ staticColliders: [] })).toThrow("primary allocation error");
        expect(scene.meshes).toHaveLength(2);
        expect(scene.meshes[0] === prior).toBe(true);
        expect(scene.meshes[1] === unrelated).toBe(true);
        expect(scene.onNewMeshAddedObservable.observers).toHaveLength(observerCount);
        expect(Object.getOwnPropertyDescriptor(scene, "addMesh")).toEqual(addMeshDescriptor);
        expect(cleanup).toEqual(["block-cluster-000003", "block-cluster-000002", "block-cluster-000001"]);
        expect(() => session.finalize({ staticColliders: [] })).toThrow("WORLDKIT_NATIVE_BLOCK_SESSION_CLOSED");
      } finally { spy.mockRestore(); }
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
        );
        build(session);
        blocks = session.finalize({ staticColliders: [] })
          .checkedLayout.layout.blocks
          .map((block) => ({
            ...block,
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

  it("preserves a late Host commit failure while cleaning clusters, proxies and materials", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();
    withScene(scene => {
      const cleaned: string[] = [];
      const session = createBabylonNativeBlockProfileSessionV1(createContext(scene, {
        registerSpawnMarker() {},
        registerStaticCollider(collider) {
          const dispose = collider.mesh.dispose.bind(collider.mesh);
          collider.mesh.dispose = (...args) => {
            cleaned.push(collider.id); dispose(...args); throw new Error("secondary proxy cleanup");
          };
        },
      }));
      for (const x of [0, 1]) session.createBlock({ id: `block-${x}`, shape: "full",
        paletteRole: "ground", centerMetersXYZ: [x, 0.5, 0] });
      commitProfileSettlement.mockImplementationOnce(() => { throw new Error("late Host commit failed"); });
      expect(() => session.finalize({ staticColliders: [0, 1].map(x => ({
        id: `collider-${x}`, colliderGeometrySource: { kind: "block" as const, blockId: `block-${x}` },
        traversalBinding: { kind: "not-traversable" as const }, exposedEdgePolicy: "none" as const,
      })) })).toThrow("late Host commit failed");
      expect(cleaned).toEqual(["collider-1", "collider-0"]);
      expect(scene.meshes).toHaveLength(0);
      expect(scene.materials).toHaveLength(0);
    });
  });

});
