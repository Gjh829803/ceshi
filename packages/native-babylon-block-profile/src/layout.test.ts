import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
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
      shape: "full" | "half" | "quarter" | "small";
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
    structuralHalfMeterTransitionKeys: readonly string[];
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
    shape?: "full" | "half" | "quarter" | "small";
    paletteRole?: "ground" | "route" | "structure";
    visualGroupId?: string;
  }>,
): BabylonNativeBlockSessionRecordV1 {
  const shape = input.shape ?? "full";
  const size = ({
    full: [1, 1, 1],
    half: [1, 0.5, 1],
    quarter: [0.5, 0.5, 1],
    small: [0.5, 0.5, 0.5],
  } satisfies Record<typeof shape, readonly [number, number, number]>)[shape];
  const mesh = MeshBuilder.CreateBox(input.id, {
    width: size[0],
    height: size[1],
    depth: size[2],
  }, scene);
  return Object.freeze({
    definition: Object.freeze({
      id: input.id,
      shape,
      paletteRole: input.paletteRole ?? "ground",
      ...(input.visualGroupId === undefined
        ? {}
        : { visualGroupId: input.visualGroupId }),
    }),
    mesh,
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

describe("Babylon Native block profile layout", () => {
  it("derives an asymmetric block from its final nested Babylon world transform", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await loadLayout();

    withScene((scene) => {
      const root = new TransformNode("root", scene);
      root.position.set(1, 0, 0);
      root.rotation.y = Math.PI / 2;
      const entry = record(scene, {
        id: "ridge-quarter",
        shape: "quarter",
        paletteRole: "structure",
        visualGroupId: "ridge",
      });
      entry.mesh.parent = root;
      entry.mesh.position.set(0.25, 0.25, 0.5);

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
        occupiedMicroCellKeys: ["2,0,-1", "3,0,-1"],
      }]);
    });
  });

  it("canonicalizes negative coordinates and ignores creation order", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await loadLayout();

    withScene((scene) => {
      const west = record(scene, { id: "west-block", shape: "small" });
      west.mesh.position.set(-0.25, 0.25, -0.25);
      const east = record(scene, { id: "east-block", shape: "small" });
      east.mesh.position.set(0.25, 0.25, -0.25);

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

  it("reports invalid final Mesh lifecycle and transforms without publishing them", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await loadLayout();
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const foreignScene = new Scene(engine);
    try {
      const disposed = record(scene, { id: "disposed-block" });
      disposed.mesh.dispose();
      const foreign = record(foreignScene, { id: "foreign-block" });
      const scaled = record(scene, { id: "scaled-block" });
      scaled.mesh.scaling.set(2, 1, 1);
      const tilted = record(scene, { id: "tilted-block" });
      tilted.mesh.rotation.x = Math.PI / 4;
      const diagonal = record(scene, { id: "diagonal-block" });
      diagonal.mesh.rotation.y = Math.PI / 4;
      const offGrid = record(scene, { id: "off-grid-block" });
      offGrid.mesh.position.set(0.1, 0, 0);

      const layout = deriveBabylonNativeBlockLayoutV1(scene, [
        disposed,
        foreign,
        scaled,
        tilted,
        diagonal,
        offGrid,
      ]);

      expect(layout.blocks).toEqual([]);
      expect(layout.issues.map(({ blockId, code }) => [blockId, code]))
        .toEqual([
          ["diagonal-block", "WORLDKIT_NATIVE_BLOCK_WORLD_TRANSFORM_INVALID"],
          ["disposed-block", "WORLDKIT_NATIVE_BLOCK_MESH_DISPOSED"],
          ["foreign-block", "WORLDKIT_NATIVE_BLOCK_SCENE_MISMATCH"],
          ["off-grid-block", "WORLDKIT_NATIVE_BLOCK_GRID_ALIGNMENT_INVALID"],
          ["scaled-block", "WORLDKIT_NATIVE_BLOCK_WORLD_TRANSFORM_INVALID"],
          ["tilted-block", "WORLDKIT_NATIVE_BLOCK_WORLD_TRANSFORM_INVALID"],
        ]);
    } finally {
      foreignScene.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("distinguishes face contact, stacking, and occupied-cell overlap", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await loadLayout();

    withScene((scene) => {
      const left = record(scene, { id: "left-block" });
      left.mesh.position.set(0, 0.5, 0);
      const right = record(scene, { id: "right-block" });
      right.mesh.position.set(1, 0.5, 0);
      const top = record(scene, { id: "top-block" });
      top.mesh.position.set(0, 1.5, 0);
      const overlap = record(scene, { id: "overlap-block" });
      overlap.mesh.position.set(0, 0.5, 0);

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
          "0,0,-1", "0,0,0", "0,1,-1", "0,1,0",
        ],
      });
    });
  });

  it("reports a block above the root stratum with no structural support", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await loadLayout();

    withScene((scene) => {
      const base = record(scene, { id: "base-block" });
      base.mesh.position.set(0, 0.5, 0);
      const floating = record(scene, { id: "floating-block", shape: "small" });
      floating.mesh.position.set(2.25, 2.25, 0.25);

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
      ].map(([id, x, z]) => {
        const entry = record(scene, { id: String(id) });
        entry.mesh.position.set(Number(x), 0.5, Number(z));
        return entry;
      });

      const layout = deriveBabylonNativeBlockLayoutV1(scene, entries);

      expect(layout.exposedTopSurfaceCellKeys).toHaveLength(16);
      expect(layout.boundarySegmentKeys).toHaveLength(16);
      expect(layout.structuralHalfMeterTransitionKeys).toEqual([]);
    });
  });

  it("emits only half-meter structural transitions, never a passability claim", async () => {
    const { deriveBabylonNativeBlockLayoutV1 } = await loadLayout();

    withScene((scene) => {
      const lowHalf = record(scene, {
        id: "low-half",
        shape: "half",
        paletteRole: "route",
      });
      lowHalf.mesh.position.set(0, 0.25, 0);
      const highHalf = record(scene, {
        id: "high-half",
        shape: "half",
        paletteRole: "route",
      });
      highHalf.mesh.position.set(1, 0.75, 0);
      const oneMeterHigh = record(scene, {
        id: "one-meter-high",
        shape: "full",
        paletteRole: "route",
      });
      oneMeterHigh.mesh.position.set(3, 1.5, 0);
      const oneMeterLow = record(scene, {
        id: "one-meter-low",
        shape: "full",
        paletteRole: "route",
      });
      oneMeterLow.mesh.position.set(2, 0.5, 0);

      const halfMeterLayout = deriveBabylonNativeBlockLayoutV1(
        scene,
        [lowHalf, highHalf],
      );
      const oneMeterLayout = deriveBabylonNativeBlockLayoutV1(
        scene,
        [oneMeterLow, oneMeterHigh],
      );

      expect(halfMeterLayout.structuralHalfMeterTransitionKeys).toHaveLength(2);
      expect(oneMeterLayout.structuralHalfMeterTransitionKeys).toEqual([]);
      expect(Object.keys(halfMeterLayout)).not.toContain("isPassable");
      expect(Object.keys(halfMeterLayout)).not.toContain("routeEvidence");
    });
  });
});
