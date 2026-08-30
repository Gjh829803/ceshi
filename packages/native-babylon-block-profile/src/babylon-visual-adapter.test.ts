import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import { describe, expect, it } from "vitest";

import type {
  BabylonNativeBlockProfileCheckResultV1,
  BabylonNativeBlockVisualGroupInventoryV1,
} from "./check.js";
import type { BabylonNativeBlockLayoutV1 } from "./layout.js";
import type {
  BabylonNativeBlockCheckedLayoutV1,
  BabylonNativeBlockSessionRecordV1,
} from "./session.js";

interface VisualAdapterModule {
  createBabylonNativeBlockVisualsV1(input: Readonly<{
    scene: Scene;
    buildEpochId: string;
    checkedLayout: BabylonNativeBlockCheckedLayoutV1;
    displayGapMeters?: number;
  }>): Readonly<{
    kind: "babylon-native-block-visuals";
    schemaVersion: 1;
    buildEpochId: string;
    nodes: readonly Readonly<{
      blockId: string;
      paletteRole: string;
      visualGroupId?: string;
      mesh: Mesh;
    }>[];
    visualGroups: readonly Readonly<{
      id: string;
      blockIds: readonly string[];
      paletteRoles: readonly string[];
      minimumMetersXYZ: readonly [number, number, number];
      maximumMetersXYZ: readonly [number, number, number];
    }>[];
    dispose(): void;
  }>;
}

async function loadVisualAdapter(): Promise<VisualAdapterModule> {
  const modulePath = ["./", "babylon-visual-adapter.js"].join("");
  return import(modulePath) as Promise<VisualAdapterModule>;
}

const visualGroups = Object.freeze([
  Object.freeze({
    id: "ridge-gate",
    blockIds: Object.freeze(["gate-cap", "gate-quarter"]),
    paletteRoles: Object.freeze(["hazard", "structure"] as const),
    minimumMetersXYZ: Object.freeze([0.75, 0, -0.25] as const),
    maximumMetersXYZ: Object.freeze([2.5, 0.5, 0.5] as const),
  }),
] satisfies readonly BabylonNativeBlockVisualGroupInventoryV1[]);

function layoutFixture(reverse = false): BabylonNativeBlockLayoutV1 {
  const blocks: BabylonNativeBlockLayoutV1["blocks"] = [
    Object.freeze({
      id: "route-block",
      shape: "full",
      paletteRole: "route",
      centerMetersXYZ: Object.freeze([0, 0.5, 0] as const),
      rotationQuarterTurnsY: 0,
      sizeMetersXYZ: Object.freeze([1, 1, 1] as const),
      minimumMetersXYZ: Object.freeze([-0.5, 0, -0.5] as const),
      maximumMetersXYZ: Object.freeze([0.5, 1, 0.5] as const),
      occupiedMicroCellKeys: Object.freeze([]),
    }),
    Object.freeze({
      id: "gate-quarter",
      shape: "quarter",
      paletteRole: "structure",
      visualGroupId: "ridge-gate",
      centerMetersXYZ: Object.freeze([1.25, 0.25, 0] as const),
      rotationQuarterTurnsY: 1,
      sizeMetersXYZ: Object.freeze([1, 0.5, 0.5] as const),
      minimumMetersXYZ: Object.freeze([0.75, 0, -0.25] as const),
      maximumMetersXYZ: Object.freeze([1.75, 0.5, 0.25] as const),
      occupiedMicroCellKeys: Object.freeze([]),
    }),
    Object.freeze({
      id: "gate-cap",
      shape: "small",
      paletteRole: "hazard",
      visualGroupId: "ridge-gate",
      centerMetersXYZ: Object.freeze([2.25, 0.25, 0.25] as const),
      rotationQuarterTurnsY: 0,
      sizeMetersXYZ: Object.freeze([0.5, 0.5, 0.5] as const),
      minimumMetersXYZ: Object.freeze([2, 0, 0] as const),
      maximumMetersXYZ: Object.freeze([2.5, 0.5, 0.5] as const),
      occupiedMicroCellKeys: Object.freeze([]),
    }),
  ];
  return Object.freeze({
    blocks: Object.freeze(reverse ? [...blocks].reverse() : [...blocks]),
    issues: Object.freeze([]),
    exposedTopSurfaceCellKeys: Object.freeze([]),
    boundarySegmentKeys: Object.freeze([]),
    structuralHalfMeterTransitionKeys: Object.freeze([]),
    unsupportedBlockIds: Object.freeze([]),
  });
}

function passedCheckResult(): BabylonNativeBlockProfileCheckResultV1 {
  return Object.freeze({
    kind: "babylon-native-block-profile-check-result",
    schemaVersion: 1,
    id: "visual-fixture.whitebox-blocks-check",
    outcome: "passed",
    diagnostics: Object.freeze([]),
    metrics: Object.freeze({
      blockCount: 3,
      blockCountByShape: Object.freeze({
        full: 1,
        half: 0,
        quarter: 1,
        small: 1,
      }),
      blockCountByPaletteRole: Object.freeze({
        ground: 0,
        route: 1,
        structure: 1,
        hazard: 1,
        "water-like-visual": 0,
        "background-mass": 0,
      }),
      occupiedMicroCellCount: 0,
      exposedTopSurfaceCellCount: 0,
      boundarySegmentCount: 0,
      structuralHalfMeterTransitionCount: 0,
      unsupportedBlockCount: 0,
      structuralRouteComponentCount: 1,
      visualGroupCount: 1,
    }),
    visualGroups,
  });
}

function recordsFixture(
  scene: Scene,
  reverse = false,
): readonly BabylonNativeBlockSessionRecordV1[] {
  const layout = layoutFixture();
  const records = layout.blocks.map((block) => {
    const localSize = ({
      full: [1, 1, 1],
      half: [1, 0.5, 1],
      quarter: [0.5, 0.5, 1],
      small: [0.5, 0.5, 0.5],
    } satisfies Record<typeof block.shape, readonly [number, number, number]>)[
      block.shape
    ];
    const mesh = MeshBuilder.CreateBox(block.id, {
      width: localSize[0],
      height: localSize[1],
      depth: localSize[2],
    }, scene);
    mesh.position.set(...block.centerMetersXYZ);
    mesh.rotation.y = block.rotationQuarterTurnsY * Math.PI / 2;
    return Object.freeze({
      input: Object.freeze({
        id: block.id,
        shape: block.shape,
        paletteRole: block.paletteRole,
        ...(block.visualGroupId === undefined
          ? {}
          : { visualGroupId: block.visualGroupId }),
      }),
      mesh,
      localGeometrySnapshot: Object.freeze({
        positions: Object.freeze(Array.from(
          mesh.getVerticesData(VertexBuffer.PositionKind)!,
        )),
        indices: Object.freeze(Array.from(mesh.getIndices()!)),
      }),
    });
  });
  return Object.freeze(reverse ? [...records].reverse() : records);
}

function checkedLayoutFixture(
  scene: Scene,
  reverse = false,
): BabylonNativeBlockCheckedLayoutV1 {
  return Object.freeze({
    kind: "babylon-native-block-checked-layout",
    schemaVersion: 1,
    layout: layoutFixture(reverse),
    checkResult: passedCheckResult(),
    records: recordsFixture(scene, reverse),
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

describe("Babylon Native block visual adapter", () => {
  it("materializes stable ordinary Babylon Meshes with Profile transforms, materials, and groups", async () => {
    const { createBabylonNativeBlockVisualsV1 } = await loadVisualAdapter();

    withScene((scene) => {
      const activeCameraBefore = scene.activeCamera;
      const physicsEngineBefore = scene.getPhysicsEngine();
      const checkedLayout = checkedLayoutFixture(scene, true);
      const visuals = createBabylonNativeBlockVisualsV1({
        scene,
        buildEpochId: "candidate-epoch-001",
        checkedLayout,
        displayGapMeters: 0.04,
      });

      expect(visuals).toMatchObject({
        kind: "babylon-native-block-visuals",
        schemaVersion: 1,
        buildEpochId: "candidate-epoch-001",
      });
      expect(visuals.nodes.map(({ blockId }) => blockId)).toEqual([
        "gate-cap",
        "gate-quarter",
        "route-block",
      ]);
      expect(visuals.visualGroups).toEqual(visualGroups);
      const meshByBlockId = new Map(checkedLayout.records.map(({ input, mesh }) =>
        [input.id, mesh] as const));
      expect(visuals.nodes.every(({ blockId, mesh }) =>
        meshByBlockId.get(blockId) === mesh,
      )).toBe(true);

      const quarter = visuals.nodes.find(({ blockId }) =>
        blockId === "gate-quarter")!;
      expect(quarter.mesh.position.asArray()).toEqual([1.25, 0.25, 0]);
      expect(quarter.mesh.rotation.y).toBeCloseTo(Math.PI / 2, 12);
      quarter.mesh.computeWorldMatrix(true);
      const halfExtents = quarter.mesh.getBoundingInfo()
        .boundingBox.extendSizeWorld.asArray().sort((left, right) =>
          left - right);
      expect(halfExtents[0]).toBeCloseTo(0.23, 5);
      expect(halfExtents[1]).toBeCloseTo(0.23, 5);
      expect(halfExtents[2]).toBeCloseTo(0.48, 5);
      const quarterMaterial = quarter.mesh.material;
      expect(quarterMaterial?.name).toBe(
        "candidate-epoch-001.palette.structure",
      );
      expect(quarterMaterial).toBeInstanceOf(StandardMaterial);
      if (!(quarterMaterial instanceof StandardMaterial)) {
        throw new TypeError("expected one Babylon StandardMaterial");
      }
      expect(quarterMaterial.diffuseColor).toEqual(
        Color3.FromHexString("#AEB8C4"),
      );

      expect(visuals.nodes.every(({ mesh }) =>
        mesh.hasInstances === false && mesh.hasThinInstances === false,
      )).toBe(true);
      expect(scene.activeCamera).toBe(activeCameraBefore);
      expect(scene.getPhysicsEngine()).toBe(physicsEngineBefore);
      expect(Object.isFrozen(visuals.nodes)).toBe(true);
      expect(Object.isFrozen(visuals.visualGroups)).toBe(true);
    });
  });

  it("keeps Candidate instances isolated and leaves Profile Mesh disposal to the session", async () => {
    const { createBabylonNativeBlockVisualsV1 } = await loadVisualAdapter();
    const firstEngine = new NullEngine();
    const secondEngine = new NullEngine();
    const firstScene = new Scene(firstEngine);
    const secondScene = new Scene(secondEngine);
    try {
      const first = createBabylonNativeBlockVisualsV1({
        scene: firstScene,
        buildEpochId: "candidate-epoch-first",
        checkedLayout: checkedLayoutFixture(firstScene),
      });
      const second = createBabylonNativeBlockVisualsV1({
        scene: secondScene,
        buildEpochId: "candidate-epoch-second",
        checkedLayout: checkedLayoutFixture(secondScene),
      });

      expect(first.nodes[0]?.mesh).not.toBe(second.nodes[0]?.mesh);
      expect(first.nodes[0]?.mesh.material).not.toBe(
        second.nodes[0]?.mesh.material,
      );

      const firstMaterial = first.nodes[0]?.mesh.material;
      first.dispose();
      first.dispose();

      expect(first.nodes.every(({ mesh }) => !mesh.isDisposed())).toBe(true);
      expect(first.nodes.every(({ mesh }) => mesh.material === null)).toBe(true);
      expect(firstScene.materials).not.toContain(firstMaterial);
      expect(second.nodes.every(({ mesh }) => !mesh.isDisposed())).toBe(true);
      expect(firstScene.isDisposed).toBe(false);
      expect(secondScene.isDisposed).toBe(false);
    } finally {
      firstScene.dispose();
      secondScene.dispose();
      firstEngine.dispose();
      secondEngine.dispose();
    }
  });

  it("rejects an unpassed or mismatched check before publishing visual nodes", async () => {
    const { createBabylonNativeBlockVisualsV1 } = await loadVisualAdapter();

    withScene((scene) => {
      expect(() => createBabylonNativeBlockVisualsV1({
        scene,
        buildEpochId: "candidate-epoch-rejected",
        checkedLayout: Object.freeze({
          ...checkedLayoutFixture(scene),
          layout: Object.freeze({
            ...layoutFixture(),
            issues: Object.freeze([Object.freeze({
              code: "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP" as const,
              blockId: "gate-cap",
              relatedBlockId: "gate-quarter",
            })]),
          }),
        }),
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_VISUAL_INPUT_REJECTED/);
      expect(scene.materials).toEqual([]);

      expect(() => createBabylonNativeBlockVisualsV1({
        scene,
        buildEpochId: "candidate-epoch-mismatch",
        checkedLayout: Object.freeze({
          ...checkedLayoutFixture(scene),
          checkResult: Object.freeze({
            ...passedCheckResult(),
            visualGroups: Object.freeze([]),
          }),
        }),
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_VISUAL_GROUP_MISMATCH/);
      expect(scene.materials).toEqual([]);
    });
  });
});
