import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  createBabylonNativeHostRandomV1,
  type BabylonNativeSceneBuildContextV1,
} from "@whitebox-world/native-babylon";
import { describe, expect, it } from "vitest";

import {
  BABYLON_NATIVE_BLOCK_PROFILE_DIAGNOSTIC_CODES_V1,
  createBabylonNativeBlockProfileCheckResultV1,
} from "./check.js";
import { deriveBabylonNativeBlockLayoutV1 } from "./layout.js";
import type { BabylonNativeBlockSessionRecordV1 } from "./session.js";
import { BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1 } from "./shapes.js";

type Shape = "full" | "half" | "quarter" | "small" | "step";
type PaletteRole =
  | "ground"
  | "route"
  | "structure"
  | "hazard"
  | "water-like-visual"
  | "background-mass";

interface BlockCreateInput {
  readonly id: string;
  readonly shape: Shape;
  readonly paletteRole: PaletteRole;
  readonly centerMetersXYZ: readonly [number, number, number];
  readonly rotationQuarterTurnsY?: 0 | 1 | 2 | 3;
  readonly visualGroupId?: string;
}

interface BlockProfileModule {
  readonly BABYLON_NATIVE_BLOCK_PROFILE_DIAGNOSTIC_CODES_V1: readonly string[];
  createBabylonNativeBlockProfileSessionV1(
    context: BabylonNativeSceneBuildContextV1,
    budget: Readonly<{ maximumBlockCount: number }>,
  ): {
    createBlock(input: Readonly<BlockCreateInput>): Mesh;
    finalize(): Readonly<{
      kind: "babylon-native-block-checked-layout";
      schemaVersion: 1;
      checkResult: Readonly<{
      kind: "babylon-native-block-profile-check-result";
      schemaVersion: 1;
      id: string;
      outcome: "passed" | "rejected";
      diagnostics: readonly Readonly<{
        kind: "babylon-native-block-profile-diagnostic";
        schemaVersion: 1;
        id: string;
        severity: "warning" | "error";
        code: string;
        location:
          | Readonly<{ kind: "none" }>
          | Readonly<{ kind: "block"; blockId: string }>
          | Readonly<{ kind: "visual-group"; visualGroupId: string }>;
        message: string;
        repairHint: string;
      }>[];
      metrics: Readonly<{
        blockCount: number;
        blockCountByShape: Readonly<Record<Shape, number>>;
        blockCountByPaletteRole: Readonly<Record<PaletteRole, number>>;
        occupiedMicroCellCount: number;
        exposedTopSurfaceCellCount: number;
        boundarySegmentCount: number;
        structuralStepTransitionCount: number;
        unsupportedBlockCount: number;
        structuralRouteComponentCount: number;
        visualGroupCount: number;
      }>;
      visualGroups: readonly Readonly<{
        id: string;
        blockIds: readonly string[];
        paletteRoles: readonly PaletteRole[];
        minimumMetersXYZ: readonly [number, number, number];
        maximumMetersXYZ: readonly [number, number, number];
      }>[];
      }>;
    }>;
  };
}

async function loadProfile(): Promise<BlockProfileModule> {
  return {
    BABYLON_NATIVE_BLOCK_PROFILE_DIAGNOSTIC_CODES_V1,
    createBabylonNativeBlockProfileSessionV1(context, budget) {
      const records: BabylonNativeBlockSessionRecordV1[] = [];
      return {
        createBlock(input) {
          if (records.length >= budget.maximumBlockCount) {
            throw new Error("test check-session budget exceeded");
          }
          const [width, height, depth] =
            BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1[input.shape];
          const mesh = MeshBuilder.CreateBox(input.id, {
            width,
            height,
            depth,
            updatable: true,
          }, context.scene);
          mesh.id = input.id;
          mesh.position.set(...input.centerMetersXYZ);
          mesh.rotation.y = (input.rotationQuarterTurnsY ?? 0) * Math.PI / 2;
          const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
          const indices = mesh.getIndices();
          if (positions === null || indices === null) {
            throw new Error("test check-session could not snapshot Mesh geometry");
          }
          records.push(Object.freeze({
            input: Object.freeze({ ...input }),
            mesh,
            localGeometrySnapshot: Object.freeze({
              positions: Object.freeze([...positions]),
              indices: Object.freeze(Array.from(indices)),
            }),
          }));
          return mesh;
        },
        finalize() {
          const frozenRecords = Object.freeze([...records]);
          const layout = deriveBabylonNativeBlockLayoutV1(
            context.scene,
            frozenRecords,
          );
          return Object.freeze({
            kind: "babylon-native-block-checked-layout" as const,
            schemaVersion: 1 as const,
            checkResult: createBabylonNativeBlockProfileCheckResultV1(
              context.bootstrap.id,
              frozenRecords,
              layout,
            ),
          });
        },
      };
    },
  };
}

function createContext(
  scene: Scene,
  id = "block-profile-check",
): BabylonNativeSceneBuildContextV1 {
  return Object.freeze({
    scene,
    bootstrap: Object.freeze({
      kind: "babylon-native-scene-bootstrap",
      schemaVersion: 1,
      id,
      sceneModuleRef: "worldkit://native-scene/block-profile-check@1",
      nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
      nativeSceneProfileRef:
        "worldkit://native-scene-profile/whitebox.blocks@1",
      gameplayBootstrapRef:
        "worldkit://gameplay-bootstrap/block-profile-check@1",
      initialControlledEntityId: "player",
      gravityMetersPerSecondSquaredXYZ: Object.freeze([0, -9.81, 0] as const),
      initialCamera: Object.freeze({
        mode: "third-person",
        pitchRadians: 0.2,
        distanceMeters: 5,
        fovDegrees: 60,
        targetHeightMeters: 1.2,
      }),
      seed: 82,
      spawnMarkerId: "player-spawn",
    }),
    random: createBabylonNativeHostRandomV1(82),
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

describe("Babylon Native block profile structural check", () => {
  it("publishes one closed diagnostic-code vocabulary", async () => {
    const profile = await loadProfile();

    expect(profile.BABYLON_NATIVE_BLOCK_PROFILE_DIAGNOSTIC_CODES_V1).toEqual([
      "WORLDKIT_NATIVE_BLOCK_GRID_ALIGNMENT_INVALID",
      "WORLDKIT_NATIVE_BLOCK_MESH_DISPOSED",
      "WORLDKIT_NATIVE_BLOCK_MESH_GEOMETRY_INVALID",
      "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP",
      "WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED",
      "WORLDKIT_NATIVE_BLOCK_SCENE_MISMATCH",
      "WORLDKIT_NATIVE_BLOCK_STRUCTURAL_SUPPORT_MISSING",
      "WORLDKIT_NATIVE_BLOCK_VISUAL_GROUP_REQUIRED",
      "WORLDKIT_NATIVE_BLOCK_WORLD_TRANSFORM_INVALID",
    ]);
    expect(Object.isFrozen(
      profile.BABYLON_NATIVE_BLOCK_PROFILE_DIAGNOSTIC_CODES_V1,
    )).toBe(true);
  });

  it("publishes exact metrics for one valid full block", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadProfile();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 1 },
      );
      const ground = session.createBlock({
        id: "ground-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      });

      const result = session.finalize().checkResult;

      expect(result).toEqual({
        kind: "babylon-native-block-profile-check-result",
        schemaVersion: 1,
        id: "block-profile-check.whitebox-blocks-check",
        outcome: "passed",
        diagnostics: [],
        metrics: {
          blockCount: 1,
          blockCountByShape: {
            full: 1,
            half: 0,
            quarter: 0,
            small: 0,
            step: 0,
          },
          blockCountByPaletteRole: {
            ground: 1,
            route: 0,
            structure: 0,
            hazard: 0,
            "water-like-visual": 0,
            "background-mass": 0,
          },
          occupiedMicroCellCount: 16,
          exposedTopSurfaceCellCount: 4,
          boundarySegmentCount: 8,
          structuralStepTransitionCount: 0,
          unsupportedBlockCount: 0,
          structuralRouteComponentCount: 0,
          visualGroupCount: 0,
        },
        visualGroups: [],
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.diagnostics)).toBe(true);
      expect(Object.isFrozen(result.metrics)).toBe(true);
      expect(Object.isFrozen(result.metrics.blockCountByShape)).toBe(true);
      expect(Object.isFrozen(result.metrics.blockCountByPaletteRole)).toBe(true);
      expect(Object.isFrozen(result.visualGroups)).toBe(true);
    });
  });

  it("publishes stable visual-group inventory without Babylon handles", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadProfile();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 2 },
      );
      const upper = session.createBlock({
        id: "gate-upper",
        shape: "small",
        paletteRole: "hazard",
        visualGroupId: "gate",
        centerMetersXYZ: [0.25, 0.75, 0.25],
      });
      const lower = session.createBlock({
        id: "gate-lower",
        shape: "small",
        paletteRole: "structure",
        visualGroupId: "gate",
        centerMetersXYZ: [0.25, 0.25, 0.25],
      });

      const result = session.finalize().checkResult;

      expect(result.outcome).toBe("passed");
      expect(result.visualGroups).toEqual([{
        id: "gate",
        blockIds: ["gate-lower", "gate-upper"],
        paletteRoles: ["hazard", "structure"],
        minimumMetersXYZ: [0, 0, 0],
        maximumMetersXYZ: [0.5, 1, 0.5],
      }]);
      expect(JSON.stringify(result)).not.toMatch(
        /Mesh|Scene|registration|collider|traversalSurfaceId|BlockWorldManifest|occupiedMicroCellKeys/,
      );
      expect(Object.isFrozen(result.visualGroups[0])).toBe(true);
      expect(Object.isFrozen(result.visualGroups[0]?.blockIds)).toBe(true);
      expect(Object.isFrozen(result.visualGroups[0]?.paletteRoles)).toBe(true);
      expect(Object.isFrozen(result.visualGroups[0]?.minimumMetersXYZ)).toBe(true);
    });
  });

  it("is deterministic under reversed Mesh creation order", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadProfile();

    const build = (reverse: boolean) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      try {
        const session = createBabylonNativeBlockProfileSessionV1(
          createContext(scene, "deterministic-check"),
          { maximumBlockCount: 3 },
        );
        const definitions = [
          { id: "route-west", x: 0 },
          { id: "route-middle", x: 1 },
          { id: "route-east", x: 2 },
        ];
        for (const definition of reverse ? [...definitions].reverse() : definitions) {
          const mesh = session.createBlock({
            id: definition.id,
            shape: "full",
            paletteRole: "route",
            centerMetersXYZ: [definition.x, 0.5, 0],
          });
        }
        return session.finalize().checkResult;
      } finally {
        scene.dispose();
        engine.dispose();
      }
    };

    const forward = build(false);
    const reversed = build(true);
    expect(forward).toMatchObject({
      kind: "babylon-native-block-profile-check-result",
      outcome: "passed",
    });
    expect(forward).toEqual(reversed);
  });

  it("connects only route blocks within one quarter-meter structural step", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadProfile();

    const build = (upperY: number) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      try {
        const session = createBabylonNativeBlockProfileSessionV1(
          createContext(scene, `step-route-${upperY}`),
          { maximumBlockCount: 2 },
        );
        const low = session.createBlock({
          id: "low-step",
          shape: "step",
          paletteRole: "route",
          centerMetersXYZ: [0, 0.125, 0],
        });
        const high = session.createBlock({
          id: "high-step",
          shape: "step",
          paletteRole: "route",
          centerMetersXYZ: [1, upperY, 0],
        });
        return session.finalize().checkResult;
      } finally {
        scene.dispose();
        engine.dispose();
      }
    };

    const oneStep = build(0.375);
    const twoSteps = build(0.625);

    expect(oneStep.outcome).toBe("passed");
    expect(oneStep.metrics.structuralRouteComponentCount).toBe(1);
    expect(oneStep.metrics.structuralStepTransitionCount).toBe(2);
    expect(twoSteps.outcome).toBe("rejected");
    expect(twoSteps.metrics.structuralRouteComponentCount).toBe(2);
    expect(twoSteps.diagnostics).toContainEqual(expect.objectContaining({
      code: "WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED",
      severity: "error",
    }));
    expect(twoSteps.diagnostics.find(({ code }) =>
      code === "WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED")?.repairHint).toBe(
      "Connect the visual route topology and validate Runtime passability separately through the SDK/Havok gate.",
    );
  });

  it("rejects overlap, missing groups, and disconnected structural routes", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadProfile();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 5 },
      );
      const first = session.createBlock({
        id: "overlap-first",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      });
      const second = session.createBlock({
        id: "overlap-second",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      });
      const ungrouped = session.createBlock({
        id: "ungrouped-structure",
        shape: "small",
        paletteRole: "structure",
        centerMetersXYZ: [2.25, 0.25, 0.25],
      });
      const westRoute = session.createBlock({
        id: "west-route",
        shape: "full",
        paletteRole: "route",
        centerMetersXYZ: [4, 0.5, 0],
      });
      const eastRoute = session.createBlock({
        id: "east-route",
        shape: "full",
        paletteRole: "route",
        centerMetersXYZ: [8, 0.5, 0],
      });

      const result = session.finalize().checkResult;

      expect(result.outcome).toBe("rejected");
      expect(result.diagnostics.map(({ severity, code, location }) => ({
        severity,
        code,
        location,
      }))).toEqual([
        {
          severity: "error",
          code: "WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED",
          location: { kind: "none" },
        },
        {
          severity: "error",
          code: "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP",
          location: { kind: "block", blockId: "overlap-first" },
        },
        {
          severity: "error",
          code: "WORLDKIT_NATIVE_BLOCK_VISUAL_GROUP_REQUIRED",
          location: { kind: "block", blockId: "ungrouped-structure" },
        },
      ]);
      expect(result.metrics.structuralRouteComponentCount).toBe(2);
    });
  });

  it("keeps unsupported visual mass as a warning rather than a Runtime claim", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadProfile();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 2 },
      );
      const base = session.createBlock({
        id: "base-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      });
      const floating = session.createBlock({
        id: "floating-block",
        shape: "small",
        paletteRole: "background-mass",
        visualGroupId: "floating-mass",
        centerMetersXYZ: [2.25, 2.25, 0.25],
      });

      const result = session.finalize().checkResult;

      expect(result.outcome).toBe("passed");
      expect(result.metrics.unsupportedBlockCount).toBe(1);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: "warning",
        code: "WORLDKIT_NATIVE_BLOCK_STRUCTURAL_SUPPORT_MISSING",
        location: { kind: "block", blockId: "floating-block" },
      });
      expect(result.diagnostics[0]).not.toHaveProperty("details");
    });
  });

  it("reports a disposed final Mesh as a closed block diagnostic", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadProfile();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 1 },
      );
      const mesh = session.createBlock({
        id: "disposed-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      });
      mesh.dispose();

      const result = session.finalize().checkResult;

      expect(result.outcome).toBe("rejected");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: "error",
        code: "WORLDKIT_NATIVE_BLOCK_MESH_DISPOSED",
        location: { kind: "block", blockId: "disposed-block" },
      });
      expect(result.metrics.blockCount).toBe(1);
      expect(result.metrics.occupiedMicroCellCount).toBe(0);
    });
  });

  it("rejects local geometry mutation instead of trusting the declared shape", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadProfile();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 1 },
      );
      const mesh = session.createBlock({
        id: "mutated-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      });
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
      positions[0] = positions[0]! + 0.25;
      mesh.setVerticesData(VertexBuffer.PositionKind, positions, true);

      const result = session.finalize().checkResult;

      expect(result.outcome).toBe("rejected");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: "error",
        code: "WORLDKIT_NATIVE_BLOCK_MESH_GEOMETRY_INVALID",
        location: { kind: "block", blockId: "mutated-block" },
      });
      expect(result.metrics.occupiedMicroCellCount).toBe(0);
    });
  });

  it("rejects a Mesh that reports thin instances absent from the session inventory", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadProfile();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 1 },
      );
      const mesh = session.createBlock({
        id: "thin-instance-source",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      });
      // NullEngine intentionally lacks instanced-array support, so Babylon cannot
      // create a real thin instance here. Shadow only its public observation point
      // while retaining a real Mesh and the production checker path.
      Object.defineProperty(mesh, "hasThinInstances", {
        configurable: true,
        value: true,
      });

      const result = session.finalize().checkResult;

      expect(result.outcome).toBe("rejected");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: "error",
        code: "WORLDKIT_NATIVE_BLOCK_MESH_GEOMETRY_INVALID",
        location: { kind: "block", blockId: "thin-instance-source" },
      });
    });
  });

  it("rejects ordinary instances that are absent from the session inventory", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadProfile();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 1 },
      );
      const mesh = session.createBlock({
        id: "instance-source",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      });
      mesh.createInstance("untracked-instance").position.set(2, 0, 0);

      const result = session.finalize().checkResult;

      expect(result.outcome).toBe("rejected");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: "error",
        code: "WORLDKIT_NATIVE_BLOCK_MESH_GEOMETRY_INVALID",
        location: { kind: "block", blockId: "instance-source" },
      });
    });
  });

  it("closes a throwing Mesh geometry observation into one diagnostic", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadProfile();

    withScene((scene) => {
      const session = createBabylonNativeBlockProfileSessionV1(
        createContext(scene),
        { maximumBlockCount: 1 },
      );
      const mesh = session.createBlock({
        id: "throwing-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, 0.5, 0],
      });
      Object.defineProperty(mesh, "hasThinInstances", {
        configurable: true,
        get(): never {
          throw new Error("untrusted Mesh observation");
        },
      });

      const result = session.finalize().checkResult;

      expect(result.outcome).toBe("rejected");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: "error",
        code: "WORLDKIT_NATIVE_BLOCK_MESH_GEOMETRY_INVALID",
        location: { kind: "block", blockId: "throwing-block" },
      });
    });
  });
});
