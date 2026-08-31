import { createHash } from "node:crypto";

import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import type {
  BabylonNativeSceneRegistrationV1,
  BabylonNativeStaticColliderV1,
} from "@whitebox-world/native-babylon";
import { describe, expect, it } from "vitest";

import { createBabylonNativeBlockProfileCheckResultV1 } from "./check.js";
import {
  materializeBabylonNativeBlockColliderCandidatesV1,
} from "./collider-contribution.js";
import { deriveBabylonNativeBlockLayoutV1 } from "./layout.js";
import type { BabylonNativeBlockSessionRecordV1 } from "./session.js";

function createBabylonNativeBlockColliderCandidatesV1(input: Readonly<{
  scene: Scene;
  buildEpochId: string;
  layout: ReturnType<typeof deriveBabylonNativeBlockLayoutV1>;
  checkResult: ReturnType<typeof createBabylonNativeBlockProfileCheckResultV1>;
  records: readonly BabylonNativeBlockSessionRecordV1[];
  selections: Parameters<
    typeof materializeBabylonNativeBlockColliderCandidatesV1
  >[0]["selections"];
  registration: BabylonNativeSceneRegistrationV1;
}>): ReturnType<
  typeof materializeBabylonNativeBlockColliderCandidatesV1
>["inventory"] {
  return materializeBabylonNativeBlockColliderCandidatesV1({
    context: Object.freeze({
      scene: input.scene,
      bootstrap: Object.freeze({ id: input.buildEpochId }),
      registration: input.registration,
    }) as never,
    checkedLayout: Object.freeze({
      kind: "babylon-native-block-checked-layout",
      schemaVersion: 1,
      layout: input.layout,
      checkResult: input.checkResult,
      records: input.records,
    }),
    selections: input.selections,
  }).inventory;
}

function blockRecord(
  scene: Scene,
  input: Readonly<{
    id: string;
    shape: "full" | "half" | "quarter" | "small" | "step";
    paletteRole: "ground" | "route" | "structure";
    visualGroupId?: string;
    positionMetersXYZ?: readonly [number, number, number];
    rotationQuarterTurnsY?: number;
  }>,
): BabylonNativeBlockSessionRecordV1 {
  const size = ({
    full: [1, 1, 1],
    half: [1, 0.5, 1],
    quarter: [0.5, 0.5, 1],
    small: [0.5, 0.5, 0.5],
    step: [1, 0.25, 1],
  } satisfies Record<
    typeof input.shape,
    readonly [number, number, number]
  >)[input.shape];
  const mesh = MeshBuilder.CreateBox(input.id, {
    width: size[0],
    height: size[1],
    depth: size[2],
  }, scene);
  if (input.positionMetersXYZ !== undefined) {
    mesh.position.set(...input.positionMetersXYZ);
  }
  mesh.rotation.y = (input.rotationQuarterTurnsY ?? 0) * Math.PI / 2;
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (positions === null || indices === null) {
    throw new Error("Babylon box fixture must expose indexed geometry");
  }
  return Object.freeze({
    input: Object.freeze({
      id: input.id,
      shape: input.shape,
      paletteRole: input.paletteRole,
      ...(input.visualGroupId === undefined
        ? {}
        : { visualGroupId: input.visualGroupId }),
    }),
    mesh,
    localGeometrySnapshot: Object.freeze({
      positions: Object.freeze(Array.from(positions)),
      indices: Object.freeze(Array.from(indices)),
    }),
  });
}

function withPassedOneBlockEpoch(
  run: (epoch: Readonly<{
    scene: Scene;
    layout: ReturnType<typeof deriveBabylonNativeBlockLayoutV1>;
    checkResult: ReturnType<
      typeof createBabylonNativeBlockProfileCheckResultV1
    >;
    records: readonly BabylonNativeBlockSessionRecordV1[];
  }>) => void,
): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const record = blockRecord(scene, {
      id: "route-block-a",
      shape: "full",
      paletteRole: "route",
      visualGroupId: "route-group",
    });
    const records = Object.freeze([record]);
    const layout = deriveBabylonNativeBlockLayoutV1(scene, records);
    const checkResult = createBabylonNativeBlockProfileCheckResultV1(
      "block-collider-world",
      records,
      layout,
    );
    expect(checkResult.outcome).toBe("passed");
    run(Object.freeze({ scene, layout, checkResult, records }));
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

function colliderGeometryHash(collider: BabylonNativeStaticColliderV1): string {
  const positions = collider.mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = collider.mesh.getIndices();
  if (positions === null || indices === null) {
    throw new Error("Collider candidate must expose indexed geometry");
  }
  const matrix = collider.mesh.computeWorldMatrix(true);
  const worldPositionsMetersXYZ: number[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    const world = Vector3.TransformCoordinates(
      Vector3.FromArray(positions, index),
      matrix,
    );
    worldPositionsMetersXYZ.push(...[world.x, world.y, world.z].map((value) =>
      Object.is(value, -0) ? 0 : value));
  }
  return createHash("sha256").update(JSON.stringify({
    worldPositionsMetersXYZ,
    triangleIndices: Array.from(indices),
  })).digest("hex");
}

function deterministicTwoBlockEvidence(reverse: boolean): Readonly<{
  registrationIds: readonly string[];
  inventoryIds: readonly string[];
  geometryHashByColliderId: Readonly<Record<string, string>>;
  boundsByColliderId: Readonly<Record<
    string,
    Readonly<{
      minimum: readonly number[];
      maximum: readonly number[];
    }>
  >>;
  ratiosByColliderId: Readonly<Record<
    string,
    Readonly<{ frictionRatio?: number; restitutionRatio?: number }>
  >>;
}> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const records = [
      blockRecord(scene, {
        id: "quarter-block",
        shape: "quarter",
        paletteRole: "structure",
        visualGroupId: "ridge-group",
        positionMetersXYZ: [1, 0.25, 0.25],
        rotationQuarterTurnsY: 1,
      }),
      blockRecord(scene, {
        id: "full-block",
        shape: "full",
        paletteRole: "ground",
        visualGroupId: "ground-group",
        positionMetersXYZ: [-1, 0.5, 0],
      }),
    ];
    if (reverse) records.reverse();
    const frozenRecords = Object.freeze(records);
    const layout = deriveBabylonNativeBlockLayoutV1(scene, frozenRecords);
    const checkResult = createBabylonNativeBlockProfileCheckResultV1(
      "deterministic-block-world",
      frozenRecords,
      layout,
    );
    expect(checkResult.outcome).toBe("passed");
    const staticSurface = Object.freeze({
      kind: "static-surface" as const,
      surfaceEntityId: "ground-surface",
      logicalSubshapeId: "top",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
    });
    const selections = [
      Object.freeze({
        id: "collider-z",
        blockId: "quarter-block",
        traversalBinding: staticSurface,
      }),
      Object.freeze({
        id: "collider-a",
        blockId: "full-block",
        traversalBinding: Object.freeze({ kind: "not-traversable" as const }),
        frictionRatio: 0.25,
        restitutionRatio: 0.5,
      }),
    ];
    if (!reverse) selections.reverse();
    const registered: BabylonNativeStaticColliderV1[] = [];
    const inventory = createBabylonNativeBlockColliderCandidatesV1({
      scene,
      buildEpochId: "deterministic-block-epoch",
      layout,
      checkResult,
      records: frozenRecords,
      selections: Object.freeze(selections),
      registration: Object.freeze({
        registerSpawnMarker(): void {},
        registerStaticCollider(collider: Readonly<BabylonNativeStaticColliderV1>): void {
          registered.push(collider);
        },
      }),
    });
    return Object.freeze({
      registrationIds: Object.freeze(registered.map(({ id }) => id)),
      inventoryIds: Object.freeze(inventory.map(({ colliderId }) => colliderId)),
      geometryHashByColliderId: Object.freeze(Object.fromEntries(
        registered.map((collider) => [collider.id, colliderGeometryHash(collider)]),
      )),
      boundsByColliderId: Object.freeze(Object.fromEntries(
        registered.map((collider) => {
          collider.mesh.computeWorldMatrix(true);
          const bounds = collider.mesh.getBoundingInfo().boundingBox;
          return [collider.id, Object.freeze({
            minimum: Object.freeze(bounds.minimumWorld.asArray()),
            maximum: Object.freeze(bounds.maximumWorld.asArray()),
          })];
        }),
      )),
      ratiosByColliderId: Object.freeze(Object.fromEntries(
        registered.map((collider) => [collider.id, Object.freeze({
          ...(collider.frictionRatio === undefined
            ? {}
            : { frictionRatio: collider.frictionRatio }),
          ...(collider.restitutionRatio === undefined
            ? {}
            : { restitutionRatio: collider.restitutionRatio }),
        })]),
      )),
    });
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

describe("Babylon Native block Collider contribution", () => {
  it("registers an independent no-gap proxy from the checked Layout", () => {
    withPassedOneBlockEpoch(({ scene, layout, checkResult, records }) => {
      const registered: BabylonNativeStaticColliderV1[] = [];
      const registration: BabylonNativeSceneRegistrationV1 = Object.freeze({
        registerSpawnMarker(): void {},
        registerStaticCollider(collider: Readonly<BabylonNativeStaticColliderV1>): void {
          registered.push(collider);
        },
      });
      const traversalBinding = Object.freeze({
        kind: "static-surface" as const,
        surfaceEntityId: "route-ground",
        logicalSubshapeId: "top",
        traversalSurfaceProfileRef:
          "worldkit://traversal-surface-profile/ground.static@1",
      });

      const inventory = createBabylonNativeBlockColliderCandidatesV1({
        scene,
        buildEpochId: "block-collider-epoch-a",
        layout,
        checkResult,
        records,
        selections: Object.freeze([Object.freeze({
          id: "route-ground-a",
          blockId: "route-block-a",
          traversalBinding,
        })]),
        registration,
      });

      expect(registered).toHaveLength(1);
      const candidate = registered[0]!;
      expect(candidate.id).toBe("route-ground-a");
      expect(candidate.traversalBinding).toBe(traversalBinding);
      expect(candidate.mesh).not.toBe(records[0]!.mesh);
      expect(candidate.mesh.getVerticesData(VertexBuffer.PositionKind))
        .toHaveLength(8 * 3);
      expect(candidate.mesh.getIndices()).toHaveLength(12 * 3);
      candidate.mesh.computeWorldMatrix(true);
      expect(candidate.mesh.getBoundingInfo().boundingBox.minimumWorld.asArray())
        .toEqual([-0.5, -0.5, -0.5]);
      expect(candidate.mesh.getBoundingInfo().boundingBox.maximumWorld.asArray())
        .toEqual([0.5, 0.5, 0.5]);

      records[0]!.mesh.scaling.setAll(0.9);
      records[0]!.mesh.computeWorldMatrix(true);
      candidate.mesh.computeWorldMatrix(true);
      expect(candidate.mesh.getBoundingInfo().boundingBox.minimumWorld.asArray())
        .toEqual([-0.5, -0.5, -0.5]);
      expect(candidate.mesh.getBoundingInfo().boundingBox.maximumWorld.asArray())
        .toEqual([0.5, 0.5, 0.5]);
      expect(inventory).toEqual([{
        colliderId: "route-ground-a",
        sourceBlockIds: ["route-block-a"],
        visualGroupIds: ["route-group"],
        proxyKind: "layout-block-volume",
        traversalBinding,
      }]);
      expect(Object.isFrozen(inventory)).toBe(true);
      expect(Object.isFrozen(inventory[0])).toBe(true);
    });
  });

  it("rejects a failed structural check before proxy allocation", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const records = Object.freeze([
        blockRecord(scene, {
          id: "overlap-a",
          shape: "full",
          paletteRole: "ground",
        }),
        blockRecord(scene, {
          id: "overlap-b",
          shape: "full",
          paletteRole: "ground",
        }),
      ]);
      const layout = deriveBabylonNativeBlockLayoutV1(scene, records);
      const checkResult = createBabylonNativeBlockProfileCheckResultV1(
        "rejected-block-world",
        records,
        layout,
      );
      expect(checkResult.outcome).toBe("rejected");
      const meshCountBefore = scene.meshes.length;
      const registered: BabylonNativeStaticColliderV1[] = [];
      const registration: BabylonNativeSceneRegistrationV1 = Object.freeze({
        registerSpawnMarker(): void {},
        registerStaticCollider(collider: Readonly<BabylonNativeStaticColliderV1>): void {
          registered.push(collider);
        },
      });

      expect(() => createBabylonNativeBlockColliderCandidatesV1({
        scene,
        buildEpochId: "rejected-block-epoch",
        layout,
        checkResult,
        records,
        selections: Object.freeze([Object.freeze({
          id: "overlap-ground-a",
          blockId: "overlap-a",
          traversalBinding: Object.freeze({ kind: "not-traversable" }),
        })]),
        registration,
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_COLLIDER_CHECK_REJECTED/);
      expect(scene.meshes).toHaveLength(meshCountBefore);
      expect(registered).toEqual([]);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("preflights every block reference before the first registration", () => {
    withPassedOneBlockEpoch(({ scene, layout, checkResult, records }) => {
      const registered: BabylonNativeStaticColliderV1[] = [];
      const registration: BabylonNativeSceneRegistrationV1 = Object.freeze({
        registerSpawnMarker(): void {},
        registerStaticCollider(collider: Readonly<BabylonNativeStaticColliderV1>): void {
          registered.push(collider);
        },
      });
      const meshCountBefore = scene.meshes.length;
      const notTraversable = Object.freeze({ kind: "not-traversable" as const });

      expect(() => createBabylonNativeBlockColliderCandidatesV1({
        scene,
        buildEpochId: "missing-block-epoch",
        layout,
        checkResult,
        records,
        selections: Object.freeze([
          Object.freeze({
            id: "a-valid-ground",
            blockId: "route-block-a",
            traversalBinding: notTraversable,
          }),
          Object.freeze({
            id: "z-missing-ground",
            blockId: "missing-block",
            traversalBinding: notTraversable,
          }),
        ]),
        registration,
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_COLLIDER_BLOCK_MISSING/);
      expect(scene.meshes).toHaveLength(meshCountBefore);
      expect(registered).toEqual([]);
    });
  });

  it("rejects duplicate Collider and block identity before allocation", () => {
    withPassedOneBlockEpoch(({ scene, layout, checkResult, records }) => {
      const notTraversable = Object.freeze({ kind: "not-traversable" as const });
      const cases = [
        Object.freeze({
          selections: Object.freeze([
            Object.freeze({
              id: "duplicate-ground",
              blockId: "route-block-a",
              traversalBinding: notTraversable,
            }),
            Object.freeze({
              id: "duplicate-ground",
              blockId: "route-block-a",
              traversalBinding: notTraversable,
            }),
          ]),
          code: "WORLDKIT_NATIVE_BLOCK_COLLIDER_ID_DUPLICATE",
        }),
        Object.freeze({
          selections: Object.freeze([
            Object.freeze({
              id: "ground-a",
              blockId: "route-block-a",
              traversalBinding: notTraversable,
            }),
            Object.freeze({
              id: "ground-b",
              blockId: "route-block-a",
              traversalBinding: notTraversable,
            }),
          ]),
          code: "WORLDKIT_NATIVE_BLOCK_COLLIDER_BLOCK_DUPLICATE",
        }),
      ] as const;

      for (const testCase of cases) {
        const registered: BabylonNativeStaticColliderV1[] = [];
        const meshCountBefore = scene.meshes.length;
        expect(() => createBabylonNativeBlockColliderCandidatesV1({
          scene,
          buildEpochId: "duplicate-identity-epoch",
          layout,
          checkResult,
          records,
          selections: testCase.selections,
          registration: Object.freeze({
            registerSpawnMarker(): void {},
            registerStaticCollider(collider: Readonly<BabylonNativeStaticColliderV1>): void {
              registered.push(collider);
            },
          }),
        })).toThrow(new RegExp(testCase.code));
        expect(scene.meshes).toHaveLength(meshCountBefore);
        expect(registered).toEqual([]);
      }
    });
  });

  it("rejects records from another Candidate Scene before allocation", () => {
    withPassedOneBlockEpoch(({ layout, checkResult, records }) => {
      const otherEngine = new NullEngine();
      const otherScene = new Scene(otherEngine);
      try {
        const registered: BabylonNativeStaticColliderV1[] = [];
        expect(() => createBabylonNativeBlockColliderCandidatesV1({
          scene: otherScene,
          buildEpochId: "wrong-scene-epoch",
          layout,
          checkResult,
          records,
          selections: Object.freeze([Object.freeze({
            id: "wrong-scene-ground",
            blockId: "route-block-a",
            traversalBinding: Object.freeze({ kind: "not-traversable" }),
          })]),
          registration: Object.freeze({
            registerSpawnMarker(): void {},
            registerStaticCollider(collider: Readonly<BabylonNativeStaticColliderV1>): void {
              registered.push(collider);
            },
          }),
        })).toThrow(/WORLDKIT_NATIVE_BLOCK_SCENE_MISMATCH/);
        expect(otherScene.meshes).toEqual([]);
        expect(registered).toEqual([]);
      } finally {
        otherScene.dispose();
        otherEngine.dispose();
      }
    });
  });

  it("requires a caller-canonical frozen selection without reparsing it", () => {
    withPassedOneBlockEpoch(({ scene, layout, checkResult, records }) => {
      const registered: BabylonNativeStaticColliderV1[] = [];
      const meshCountBefore = scene.meshes.length;

      expect(() => createBabylonNativeBlockColliderCandidatesV1({
        scene,
        buildEpochId: "mutable-selection-epoch",
        layout,
        checkResult,
        records,
        selections: [{
          id: "mutable-ground",
          blockId: "route-block-a",
          traversalBinding: { kind: "not-traversable" },
        }],
        registration: Object.freeze({
          registerSpawnMarker(): void {},
          registerStaticCollider(collider: Readonly<BabylonNativeStaticColliderV1>): void {
            registered.push(collider);
          },
        }),
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_COLLIDER_SELECTION_INVALID/);
      expect(scene.meshes).toHaveLength(meshCountBefore);
      expect(registered).toEqual([]);
    });
  });

  it("preflights the Build Epoch, stable IDs, and material ratios before allocation", () => {
    withPassedOneBlockEpoch(({ scene, layout, checkResult, records }) => {
      const meshCountBefore = scene.meshes.length;
      const notTraversable = Object.freeze({ kind: "not-traversable" as const });
      const cases = [
        Object.freeze({
          buildEpochId: "Bad Epoch",
          selection: Object.freeze({
            id: "valid-collider",
            blockId: "route-block-a",
            traversalBinding: notTraversable,
          }),
        }),
        Object.freeze({
          buildEpochId: "valid-epoch",
          selection: Object.freeze({
            id: "x",
            blockId: "route-block-a",
            traversalBinding: notTraversable,
          }),
        }),
        Object.freeze({
          buildEpochId: "valid-epoch",
          selection: Object.freeze({
            id: "valid-collider",
            blockId: "Route Block A",
            traversalBinding: notTraversable,
          }),
        }),
        Object.freeze({
          buildEpochId: "valid-epoch",
          selection: Object.freeze({
            id: "valid-collider",
            blockId: "route-block-a",
            traversalBinding: notTraversable,
            frictionRatio: 1.01,
          }),
        }),
        Object.freeze({
          buildEpochId: "valid-epoch",
          selection: Object.freeze({
            id: "valid-collider",
            blockId: "route-block-a",
            traversalBinding: notTraversable,
            restitutionRatio: Number.NaN,
          }),
        }),
      ] as const;

      for (const testCase of cases) {
        const registered: BabylonNativeStaticColliderV1[] = [];
        expect(() => createBabylonNativeBlockColliderCandidatesV1({
          scene,
          buildEpochId: testCase.buildEpochId,
          layout,
          checkResult,
          records,
          selections: Object.freeze([testCase.selection]),
          registration: Object.freeze({
            registerSpawnMarker(): void {},
            registerStaticCollider(
              collider: Readonly<BabylonNativeStaticColliderV1>,
            ): void {
              registered.push(collider);
            },
          }),
        })).toThrow(/WORLDKIT_NATIVE_BLOCK_COLLIDER_SELECTION_INVALID/);
        expect(scene.meshes).toHaveLength(meshCountBefore);
        expect(registered).toEqual([]);
      }
    });
  });

  it("rejects a record identity that no longer matches the checked Layout", () => {
    withPassedOneBlockEpoch(({ scene, layout, checkResult, records }) => {
      const staleRecord = Object.freeze({
        ...records[0]!,
        input: Object.freeze({
          ...records[0]!.input,
          paletteRole: "ground" as const,
        }),
      });
      const meshCountBefore = scene.meshes.length;
      const registered: BabylonNativeStaticColliderV1[] = [];

      expect(() => createBabylonNativeBlockColliderCandidatesV1({
        scene,
        buildEpochId: "stale-record-epoch",
        layout,
        checkResult,
        records: Object.freeze([staleRecord]),
        selections: Object.freeze([Object.freeze({
          id: "stale-record-collider",
          blockId: "route-block-a",
          traversalBinding: Object.freeze({ kind: "not-traversable" as const }),
        })]),
        registration: Object.freeze({
          registerSpawnMarker(): void {},
          registerStaticCollider(
            collider: Readonly<BabylonNativeStaticColliderV1>,
          ): void {
            registered.push(collider);
          },
        }),
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_COLLIDER_RECORD_MISMATCH/);
      expect(scene.meshes).toHaveLength(meshCountBefore);
      expect(registered).toEqual([]);
    });
  });

  it("keeps identity, geometry hashes, and asymmetric bounds stable across order", () => {
    const first = deterministicTwoBlockEvidence(false);
    const reversed = deterministicTwoBlockEvidence(true);

    expect(first.registrationIds).toEqual(["collider-a", "collider-z"]);
    expect(first.inventoryIds).toEqual(["collider-a", "collider-z"]);
    expect(reversed.registrationIds).toEqual(first.registrationIds);
    expect(reversed.inventoryIds).toEqual(first.inventoryIds);
    expect(reversed.geometryHashByColliderId).toEqual(
      first.geometryHashByColliderId,
    );
    expect(first.geometryHashByColliderId["collider-a"]).not.toBe(
      first.geometryHashByColliderId["collider-z"],
    );
    expect(first.boundsByColliderId).toEqual({
      "collider-a": {
        minimum: [-1.5, 0, -0.5],
        maximum: [-0.5, 1, 0.5],
      },
      "collider-z": {
        minimum: [0.5, 0, 0],
        maximum: [1.5, 0.5, 0.5],
      },
    });
    expect(first.ratiosByColliderId).toEqual({
      "collider-a": { frictionRatio: 0.25, restitutionRatio: 0.5 },
      "collider-z": {},
    });
  });

  it("does not infer collision from palette or visual-group metadata", () => {
    withPassedOneBlockEpoch(({ scene, layout, checkResult, records }) => {
      const meshCountBefore = scene.meshes.length;
      const registered: BabylonNativeStaticColliderV1[] = [];
      const inventory = createBabylonNativeBlockColliderCandidatesV1({
        scene,
        buildEpochId: "visual-only-epoch",
        layout,
        checkResult,
        records,
        selections: Object.freeze([]),
        registration: Object.freeze({
          registerSpawnMarker(): void {},
          registerStaticCollider(collider: Readonly<BabylonNativeStaticColliderV1>): void {
            registered.push(collider);
          },
        }),
      });

      expect(inventory).toEqual([]);
      expect(Object.isFrozen(inventory)).toBe(true);
      expect(scene.meshes).toHaveLength(meshCountBefore);
      expect(registered).toEqual([]);
    });
  });
});
