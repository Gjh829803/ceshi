import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import { describe, expect, it } from "vitest";

import {
  babylonNativeBlockWalkableDisplayColorV1,
  registerBabylonNativeBlockWalkableInstanceDisplayV1,
  registerBabylonNativeBlockWalkableVertexDisplayV1,
  suspendBabylonNativeBlockWalkableDisplayV1,
} from "./whitebox-display.js";

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

describe("NBR-65G identity-bound walkable whitebox display", () => {
  it("places the first subtle stripe ahead on canonical -Z", () => {
    expect(babylonNativeBlockWalkableDisplayColorV1([0, 0, 0]))
      .toEqual([1, 1, 1, 1]);
    expect(babylonNativeBlockWalkableDisplayColorV1([0, 0, -3]))
      .toEqual([0.78, 0.8, 0.78, 1]);
    expect(babylonNativeBlockWalkableDisplayColorV1([0, 0, 3]))
      .toEqual([0.78, 0.8, 0.78, 1]);
  });

  it("binds one deterministic color to each logical batched Block", () => {
    withScene((scene) => {
      const mesh = MeshBuilder.CreateBox("batch", {}, scene);
      const matrices = new Float32Array(32);
      Matrix.Translation(0, 0, 0).copyToArray(matrices, 0);
      Matrix.Translation(0, 0, -3).copyToArray(matrices, 16);
      mesh.thinInstanceSetBuffer("matrix", matrices, 16, true);

      const registration =
        registerBabylonNativeBlockWalkableInstanceDisplayV1(mesh, [{
          blockId: "route-near",
          paletteRole: "route",
          centerMetersXYZ: [0, 0, 0],
        }, {
          blockId: "route-stripe",
          paletteRole: "route",
          centerMetersXYZ: [0, 0, -3],
        }]);

      expect(registration.blockIds).toEqual(["route-near", "route-stripe"]);
      expect([...registration.colorsRgba].map((value) =>
        Number(value.toFixed(2)))).toEqual([
        1, 1, 1, 1,
        0.78, 0.8, 0.78, 1,
      ]);
      expect(mesh.isVerticesDataPresent(VertexBuffer.ColorInstanceKind))
        .toBe(true);
      const suspension = suspendBabylonNativeBlockWalkableDisplayV1(mesh)!;
      expect(mesh.isVerticesDataPresent(VertexBuffer.ColorInstanceKind))
        .toBe(false);
      suspension.restore();
      expect(mesh.isVerticesDataPresent(VertexBuffer.ColorInstanceKind))
        .toBe(true);
      registration.dispose();
      expect(mesh.isVerticesDataPresent(VertexBuffer.ColorInstanceKind))
        .toBe(false);
    });
  });

  it("marks only independent walkable Blocks and restores Mesh flags", () => {
    withScene((scene) => {
      const walkable = MeshBuilder.CreateBox("walkable", {}, scene);
      const structure = MeshBuilder.CreateBox("structure", {}, scene);
      const priorUseVertexColors = walkable.useVertexColors;
      const priorHasVertexAlpha = walkable.hasVertexAlpha;

      const registration = registerBabylonNativeBlockWalkableVertexDisplayV1(
        walkable,
        {
          blockId: "walkable",
          paletteRole: "ground",
          centerMetersXYZ: [0, 0, -3],
        },
      )!;
      expect(walkable.isVerticesDataPresent(VertexBuffer.ColorKind)).toBe(true);
      expect(registerBabylonNativeBlockWalkableVertexDisplayV1(
        structure,
        {
          blockId: "structure",
          paletteRole: "structure",
          centerMetersXYZ: [0, 0, -3],
        },
      )).toBeUndefined();
      registration.dispose();
      expect(walkable.isVerticesDataPresent(VertexBuffer.ColorKind)).toBe(false);
      expect(walkable.useVertexColors).toBe(priorUseVertexColors);
      expect(walkable.hasVertexAlpha).toBe(priorHasVertexAlpha);
    });
  });
});
