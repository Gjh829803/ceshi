import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import type {
  ExecutionObjectV3,
  ExecutionWaterBoundaryV3,
  ExecutionWaterV3,
} from "@whitebox-world/runtime-contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createWhiteboxMaterials, type WhiteboxMaterials } from "./materials.js";
import {
  createBabylonObjectMeshV1,
  createBabylonWaterMeshV1,
} from "./scene-geometry.js";

const IDENTITY_TRANSFORM = {
  positionMetersXYZ: [0, 0, 0] as const,
  rotationEulerRadiansXYZ: [0, 0, 0] as const,
  scaleXYZ: [1, 1, 1] as const,
};

function water(
  entityId: string,
  boundary: ExecutionWaterBoundaryV3,
): ExecutionWaterV3 {
  return {
    entityId,
    terrainEntityId: "terrain",
    boundary,
    depthMeters: 2,
    shoreWidthMeters: 1,
    waterLevelMeters: 3,
    traversalMode: "blocked",
    semanticClassId: "water.test",
  };
}

function meshSize(mesh: ReturnType<typeof createBabylonObjectMeshV1>): readonly number[] {
  mesh.computeWorldMatrix(true);
  const bounds = mesh.getHierarchyBoundingVectors(true);
  return bounds.max.subtract(bounds.min).asArray();
}

function polygonMeshAreaXZ(mesh: ReturnType<typeof createBabylonWaterMeshV1>): number {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const indices = mesh.getIndices()!;
  let area = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index]! * 3;
    const b = indices[index + 1]! * 3;
    const c = indices[index + 2]! * 3;
    area += Math.abs(
      ((positions[b]! - positions[a]!) * (positions[c + 2]! - positions[a + 2]!) -
        (positions[b + 2]! - positions[a + 2]!) * (positions[c]! - positions[a]!)) /
        2,
    );
  }
  return area;
}

function polygonAreaXZ(points: readonly (readonly [number, number])[]): number {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2);
}

describe("Babylon geometry generation conformance", () => {
  let engine: NullEngine;
  let scene: Scene;
  let materials: WhiteboxMaterials;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    materials = createWhiteboxMaterials(scene);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it.each([
    ["box", { kind: "box", sizeMetersXYZ: [2, 4, 6] }, [2, 4, 6]],
    ["sphere", { kind: "sphere", radiusMeters: 2 }, [4, 4, 4]],
    ["cylinder", { kind: "cylinder", radiusMeters: 2, heightMeters: 5 }, [4, 5, 4]],
    ["cone", { kind: "cone", radiusMeters: 2, heightMeters: 5 }, [4, 5, 4]],
  ] as const)("generates canonical %s bounds and metadata", (_label, primitive, size) => {
    const object: ExecutionObjectV3 = {
      entityId: `object.${primitive.kind}`,
      prototypeId: `prototype.${primitive.kind}`,
      primitive,
      transform: IDENTITY_TRANSFORM,
      collisionEnabled: false,
      semanticClassId: `shape.${primitive.kind}`,
    };
    const mesh = createBabylonObjectMeshV1(object, materials, scene);

    expect(meshSize(mesh)).toEqual(size.map((value) => expect.closeTo(value, 5)));
    expect(mesh.metadata).toEqual({
      worldkitEntityId: object.entityId,
      semanticClassId: object.semanticClassId,
    });
  });

  it.each([
    ["circle", { kind: "circle", centerMetersXZ: [7, -5], radiusMeters: 3 }, [6, 0, 6]],
    ["ellipse", { kind: "ellipse", centerMetersXZ: [7, -5], radiusMetersXZ: [2, 4] }, [4, 0, 8]],
  ] as const)("generates an asymmetric %s water boundary", (_label, boundary, size) => {
    const mesh = createBabylonWaterMeshV1(
      water(`water.${boundary.kind}`, boundary),
      materials,
      scene,
    );

    expect(meshSize(mesh)).toEqual(size.map((value) => expect.closeTo(value, 5)));
    expect(mesh.position.asArray()).toEqual([7, 3, -5]);
    expect(mesh.metadata).toEqual({
      worldkitEntityId: `water.${boundary.kind}`,
      semanticClassId: "water.test",
    });
  });

  it.each(["counter-clockwise", "clockwise"] as const)(
    "preserves a concave polygon area in %s order",
    (order) => {
      const points = [
        [-8, -8],
        [8, -8],
        [7, 7],
        [2, 3],
        [0, 7],
        [-6, 4],
      ] as const;
      const ordered = order === "counter-clockwise" ? points : [...points].reverse();
      const mesh = createBabylonWaterMeshV1(water("water.concave", {
        kind: "polygon",
        pointsMetersXZ: ordered,
      }), materials, scene);

      expect(mesh.getTotalIndices()).toBe((points.length - 2) * 3);
      expect(polygonMeshAreaXZ(mesh)).toBeCloseTo(polygonAreaXZ(points), 10);
    },
  );

  it("keeps instances independent through disposal", () => {
    const object = (entityId: string): ExecutionObjectV3 => ({
      entityId,
      prototypeId: "prototype.box",
      primitive: { kind: "box", sizeMetersXYZ: [1, 2, 3] },
      transform: IDENTITY_TRANSFORM,
      collisionEnabled: false,
      semanticClassId: "shape.box",
    });
    const first = createBabylonObjectMeshV1(
      object("object.first"),
      materials,
      scene,
    );
    const second = createBabylonObjectMeshV1(
      object("object.second"),
      materials,
      scene,
    );

    expect(first.geometry).not.toBe(second.geometry);
    first.dispose();
    expect(scene.getMeshByName("object.first")).toBeNull();
    expect(scene.getMeshByName("object.second")).toBe(second);
    expect(meshSize(second)).toEqual([1, 2, 3]);
  });
});
