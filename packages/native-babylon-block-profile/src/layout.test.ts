import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import { describe, expect, it } from "vitest";

import type { BabylonNativeBlockSessionRecordV1 } from "./session.js";

interface LayoutModule {
  deriveBabylonNativeBlockLayoutV1(
    scene: Scene,
    records: readonly BabylonNativeBlockSessionRecordV1[],
  ): Readonly<{
    blocks: readonly Readonly<{
      id: string;
      shape: "full" | "half" | "quarter" | "small" | "step";
      paletteRole: string;
      visualGroupId?: string;
      centerMetersXYZ: readonly [number, number, number];
      rotationQuarterTurnsY: number;
      sizeMetersXYZ: readonly [number, number, number];
      minimumMetersXYZ: readonly [number, number, number];
      maximumMetersXYZ: readonly [number, number, number];
      occupiedMicroCellKeys: readonly string[];
    }>[];
    issues: readonly Readonly<{
      code: string;
      blockId: string;
      relatedBlockId?: string;
      microCellKeys?: readonly string[];
    }>[];
    exposedTopSurfaceCellKeys: readonly string[];
    boundarySegmentKeys: readonly string[];
    structuralStepTransitionKeys: readonly string[];
    unsupportedBlockIds: readonly string[];
  }>;
}

async function loadLayout(): Promise<LayoutModule> {
  const modulePath = ["./", "layout.js"].join("");
  return import(modulePath) as Promise<LayoutModule>;
}

function record(
  scene: Scene,
  input: Readonly<{
    id: string;
    shape?: "full" | "half" | "quarter" | "small" | "step";
    paletteRole?: "ground" | "route" | "structure";
    visualGroupId?: string;
    declaredCenterMetersXYZ?: readonly [number, number, number];
    declaredRotationQuarterTurnsY?: 0 | 1 | 2 | 3;
  }>,
): BabylonNativeBlockSessionRecordV1 {
  return Object.freeze({ input: Object.freeze({
    id: input.id, shape: input.shape ?? "full", paletteRole: input.paletteRole ?? "ground",
    centerMetersXYZ: input.declaredCenterMetersXYZ ?? [0, 0, 0] as const,
    rotationQuarterTurnsY: input.declaredRotationQuarterTurnsY ?? 0,
    ...(input.visualGroupId === undefined ? {} : { visualGroupId: input.visualGroupId }),
  }) });
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

describe("Babylon Native block profile layout", () => {
  it("handles large intent inventories without spreading Blocks onto the JS call stack", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await import("./layout.js");
    const { deriveBabylonNativeBlockVisualGroupsV1 } = await import("./babylon-visual-adapter.js");
    const { createBabylonNativeBlockProfileCheckResultV1 } = await import("./check.js");
    withScene(scene => {
      const records = Array.from({ length: 262_144 }, (_, index) => record(scene, {
        id: `large-${index}`, shape: "small", visualGroupId: "large-group",
        declaredCenterMetersXYZ: [index * 0.5 + 0.25, 0.25, 0.25],
      }));
      const layout = deriveBabylonNativeBlockLayoutV1(scene, records);
      expect(layout.blocks).toHaveLength(records.length);
      expect(layout.issues).toEqual([]);
      expect(layout.unsupportedBlockIds).toEqual([]);
      const groups = deriveBabylonNativeBlockVisualGroupsV1(layout);
      expect(groups[0]).toMatchObject({ minimumMetersXYZ: [0, 0, 0],
        maximumMetersXYZ: [131072, 0.5, 0.5] });
      expect(createBabylonNativeBlockProfileCheckResultV1("large-layout", records, layout).visualGroups).toEqual(groups);
      expect(scene.meshes).toHaveLength(0);
    });
  }, 30_000);
  it("derives asymmetric intent directly without any Babylon world-transform owner", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await loadLayout();

    withScene((scene) => {
      const entry = record(scene, {
        id: "ridge-quarter",
        shape: "quarter",
        paletteRole: "structure",
        visualGroupId: "ridge",
        declaredCenterMetersXYZ: [1.5, 0.25, -0.25],
        declaredRotationQuarterTurnsY: 1,
      });

      const layout = deriveBabylonNativeBlockLayoutV1(scene, [entry]);

      expect(layout.issues).toEqual([]);
      expect(layout.blocks).toEqual([{
        id: "ridge-quarter",
        shape: "quarter",
        paletteRole: "structure",
        visualGroupId: "ridge",
        centerMetersXYZ: [1.5, 0.25, -0.25],
        rotationQuarterTurnsY: 1,
        sizeMetersXYZ: [1, 0.5, 0.5],
        minimumMetersXYZ: [1, 0, -0.5],
        maximumMetersXYZ: [2, 0.5, 0],
        occupiedMicroCellKeys: [
          "2,0,-1", "3,0,-1", "2,1,-1", "3,1,-1",
        ],
      }]);
    });
  });

  it("canonicalizes negative coordinates and ignores creation order", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await loadLayout();

    withScene((scene) => {
      const west = record(scene, {
        id: "west-block",
        shape: "small",
        declaredCenterMetersXYZ: [-0.25, 0.25, -0.25],
      });
      const east = record(scene, {
        id: "east-block",
        shape: "small",
        declaredCenterMetersXYZ: [0.25, 0.25, -0.25],
      });

      const forward = deriveBabylonNativeBlockLayoutV1(scene, [west, east]);
      const reversed = deriveBabylonNativeBlockLayoutV1(scene, [east, west]);

      expect(forward).toEqual(reversed);
      expect(forward.blocks.map(({ id }) => id)).toEqual([
        "east-block",
        "west-block",
      ]);
      expect(forward.blocks[1]?.centerMetersXYZ).toEqual([-0.25, 0.25, -0.25]);
      expect(forward.blocks.flatMap(({ centerMetersXYZ }) => centerMetersXYZ)
        .some((value) => Object.is(value, -0))).toBe(false);
    });
  });

  it("rejects invalid intent lattice and a disposed Candidate without allocating geometry", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await loadLayout();
    withScene(scene => {
      const offGrid = record(scene, { id: "off-grid", declaredCenterMetersXYZ: [0.1, 0, 0] });
      expect(deriveBabylonNativeBlockLayoutV1(scene, [offGrid]).issues)
        .toMatchObject([{ blockId: "off-grid", code: "WORLDKIT_NATIVE_BLOCK_GRID_ALIGNMENT_INVALID" }]);
      expect(scene.meshes).toHaveLength(0);
      scene.dispose();
      expect(deriveBabylonNativeBlockLayoutV1(scene, [record(scene, { id: "disposed-scene" })]).issues)
        .toMatchObject([{ code: "WORLDKIT_NATIVE_BLOCK_SCENE_MISMATCH" }]);
    });
  });

  it("distinguishes face contact, stacking, and occupied-cell overlap", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await loadLayout();

    withScene((scene) => {
      const left = record(scene, {
        id: "left-block",
        declaredCenterMetersXYZ: [0, 0.5, 0],
      });
      const right = record(scene, {
        id: "right-block",
        declaredCenterMetersXYZ: [1, 0.5, 0],
      });
      const top = record(scene, {
        id: "top-block",
        declaredCenterMetersXYZ: [0, 1.5, 0],
      });
      const overlap = record(scene, {
        id: "overlap-block",
        declaredCenterMetersXYZ: [0, 0.5, 0],
      });

      const withoutOverlap = deriveBabylonNativeBlockLayoutV1(
        scene,
        [left, right, top],
      );
      const withOverlap = deriveBabylonNativeBlockLayoutV1(
        scene,
        [left, right, top, overlap],
      );

      expect(withoutOverlap.issues).toEqual([]);
      expect(withoutOverlap.unsupportedBlockIds).toEqual([]);
      expect(withOverlap.issues).toContainEqual({
        code: "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP",
        blockId: "left-block",
        relatedBlockId: "overlap-block",
        microCellKeys: [
          "-1,0,-1", "-1,0,0", "-1,1,-1", "-1,1,0",
          "-1,2,-1", "-1,2,0", "-1,3,-1", "-1,3,0",
          "0,0,-1", "0,0,0", "0,1,-1", "0,1,0",
          "0,2,-1", "0,2,0", "0,3,-1", "0,3,0",
        ],
      });
    });
  });

  it("reports a block above the root stratum with no structural support", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await loadLayout();

    withScene((scene) => {
      const base = record(scene, {
        id: "base-block",
        declaredCenterMetersXYZ: [0, 0.5, 0],
      });
      const floating = record(scene, {
        id: "floating-block",
        shape: "small",
        declaredCenterMetersXYZ: [2.25, 2.25, 0.25],
      });

      const layout = deriveBabylonNativeBlockLayoutV1(scene, [floating, base]);

      expect(layout.unsupportedBlockIds).toEqual(["floating-block"]);
    });
  });

  it("derives exposed top cells and the literal perimeter of a plateau", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await loadLayout();

    withScene((scene) => {
      const entries = [
        ["north-west", -0.5, -0.5],
        ["north-east", 0.5, -0.5],
        ["south-west", -0.5, 0.5],
        ["south-east", 0.5, 0.5],
      ].map(([id, x, z]) => record(scene, {
        id: String(id),
        declaredCenterMetersXYZ: [Number(x), 0.5, Number(z)],
      }));

      const layout = deriveBabylonNativeBlockLayoutV1(scene, entries);

      expect(layout.exposedTopSurfaceCellKeys).toHaveLength(16);
      expect(layout.boundarySegmentKeys).toHaveLength(16);
      expect(layout.structuralStepTransitionKeys).toEqual([]);
    });
  });

  it("emits only one-step structural transitions, never a passability claim", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await loadLayout();

    withScene((scene) => {
      const lowStep = record(scene, {
        id: "low-step",
        shape: "step",
        paletteRole: "route",
        declaredCenterMetersXYZ: [0, 0.125, 0],
      });
      const highStep = record(scene, {
        id: "high-step",
        shape: "step",
        paletteRole: "route",
        declaredCenterMetersXYZ: [1, 0.375, 0],
      });
      const oneMeterHigh = record(scene, {
        id: "one-meter-high",
        shape: "full",
        paletteRole: "route",
        declaredCenterMetersXYZ: [3, 1.5, 0],
      });
      const oneMeterLow = record(scene, {
        id: "one-meter-low",
        shape: "full",
        paletteRole: "route",
        declaredCenterMetersXYZ: [2, 0.5, 0],
      });

      const stepLayout = deriveBabylonNativeBlockLayoutV1(
        scene,
        [lowStep, highStep],
      );
      const oneMeterLayout = deriveBabylonNativeBlockLayoutV1(
        scene,
        [oneMeterLow, oneMeterHigh],
      );

      expect(stepLayout.structuralStepTransitionKeys).toEqual([
        "0,1,-1->1,2,-1",
        "0,1,0->1,2,0",
      ]);
      expect(oneMeterLayout.structuralStepTransitionKeys).toEqual([]);
      expect(Object.keys(stepLayout)).not.toContain("isPassable");
      expect(Object.keys(stepLayout)).not.toContain("routeEvidence");
    });
  });

  it("supports quarter-meter step stacking without overlap", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await loadLayout();

    withScene((scene) => {
      const base = record(scene, {
        id: "base-step",
        shape: "step",
        declaredCenterMetersXYZ: [0, 0.125, 0],
      });
      const top = record(scene, {
        id: "top-step",
        shape: "step",
        declaredCenterMetersXYZ: [0, 0.375, 0],
      });

      const layout = deriveBabylonNativeBlockLayoutV1(scene, [top, base]);

      expect(layout.issues).toEqual([]);
      expect(layout.unsupportedBlockIds).toEqual([]);
      expect(layout.blocks.map(({ centerMetersXYZ }) => centerMetersXYZ))
        .toEqual([[0, 0.125, 0], [0, 0.375, 0]]);
    });
  });
});
