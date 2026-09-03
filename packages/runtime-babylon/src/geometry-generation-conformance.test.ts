import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import type {
  CanonicalSceneObjectV1,
  CanonicalSceneWaterBoundaryV1,
  CanonicalSceneWaterV1,
} from "@whitebox-world/runtime-contracts";
import { BLOCK_PRESET_COLORS_V1 } from "@whitebox-world/block-world";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BLOCK_WORLD_PASTEL_DISPLAY_COLORS_V1,
  createWhiteboxMaterials,
  type WhiteboxMaterials,
} from "./materials.js";
import {
  createBabylonObjectMeshV1,
  createBabylonObjectMeshesV1,
  createBabylonWaterMeshV1,
} from "./scene-geometry.js";
import {
  buildBlockWalkableSurfaceTopologiesV1,
  createBlockWalkableSurfaceHeightSamplerV1,
  createBlockWalkableSurfaceMeshesV1,
} from "./block-walkable-surface.js";
import {
  BLOCK_WORLD_GROUND_BOUNDARY_MEMBERSHIP_MASK_V1,
  blockWorldGroundBoundaryCollideMaskV1,
  buildBlockWorldGroundBoundaryGeometryV1,
} from "./block-ground-boundary.js";

const IDENTITY_TRANSFORM = {
  positionMetersXYZ: [0, 0, 0] as const,
  rotationEulerRadiansXYZ: [0, 0, 0] as const,
  scaleXYZ: [1, 1, 1] as const,
};

function water(
  entityId: string,
  boundary: CanonicalSceneWaterBoundaryV1,
): CanonicalSceneWaterV1 {
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
  it("reconstructs a shared one-meter walkable transition as a continuous surface", () => {
    const block = (entityId: string, x: number, y: number): CanonicalSceneObjectV1 => ({
      entityId,
      prototypeId: "block-runtime-000",
      primitive: { kind: "box", sizeMetersXYZ: [1, 1, 1] },
      transform: {
        positionMetersXYZ: [x, y, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1],
      },
      collisionEnabled: true,
      semanticClassId: "block.walkable.shape.full",
    });
    const topologies = buildBlockWalkableSurfaceTopologiesV1([
      block("bw-chunk-x-p0-z-p0-cluster-0000", 0, 0),
      block("bw-chunk-x-p0-z-p0-cluster-0001", 1, 1),
    ]);
    expect(topologies).toHaveLength(1);
    expect(topologies[0]).toMatchObject({
      tileCount: 2,
      sharedTopVertexCount: 6,
      chunkKey: "0,0",
    });
    expect(topologies[0]!.groundBoundarySegments.length).toBeGreaterThan(0);
    expect(topologies[0]!.groundBoundarySegments.some(({ startMetersXYZ, endMetersXYZ }) =>
      Math.abs(startMetersXYZ[0] - 0.5) < 1e-9 &&
      Math.abs(endMetersXYZ[0] - 0.5) < 1e-9)).toBe(false);
    const boundary = buildBlockWorldGroundBoundaryGeometryV1(
      topologies[0]!.groundBoundarySegments,
    );
    expect(boundary.sourceSegmentCount).toBeGreaterThan(
      boundary.mergedSegmentCount,
    );
    expect(boundary.mergedSegmentCount).toBe(4);
    expect(boundary.triangleIndices).toHaveLength(4 * 6);
    const sharedEdgeHeights = [];
    const positions = topologies[0]!.positionsMetersXYZ;
    for (let offset = 0; offset < positions.length; offset += 3) {
      if (Math.abs(positions[offset]! - 0.5) < 1e-9 &&
          Math.abs(Math.abs(positions[offset + 2]!) - 0.5) < 1e-9) {
        sharedEdgeHeights.push(positions[offset + 1]);
      }
    }
    expect(sharedEdgeHeights.filter((height) => height === 1).length)
      .toBeGreaterThanOrEqual(2);
    const sampleHeight = createBlockWalkableSurfaceHeightSamplerV1(topologies);
    expect(sampleHeight([0, 0])).toBeCloseTo(0.75, 8);
    expect(sampleHeight([0.5, 0])).toBeCloseTo(1, 8);
    expect(sampleHeight([1, 0])).toBeCloseTo(1.25, 8);
    expect(sampleHeight([2, 0])).toBeUndefined();
    expect(sampleHeight([0, 0.6])).toBeUndefined();
    const surface = createBlockWalkableSurfaceMeshesV1(
      topologies,
      materials,
      scene,
    )[0]!;
    expect(surface.isVerticesDataPresent(VertexBuffer.ColorKind)).toBe(false);
  });

  it("adds the ground-boundary bit only for ground motion kernels", () => {
    const unrelatedMask = 0b10101;
    const ground = blockWorldGroundBoundaryCollideMaskV1(
      unrelatedMask,
      "free-ground",
    );
    expect(ground & BLOCK_WORLD_GROUND_BOUNDARY_MEMBERSHIP_MASK_V1).toBe(
      BLOCK_WORLD_GROUND_BOUNDARY_MEMBERSHIP_MASK_V1,
    );
    expect(ground & unrelatedMask).toBe(unrelatedMask);
    const flight = blockWorldGroundBoundaryCollideMaskV1(
      ground,
      "unpowered-glide",
    );
    expect(flight & BLOCK_WORLD_GROUND_BOUNDARY_MEMBERSHIP_MASK_V1).toBe(0);
    expect(flight & unrelatedMask).toBe(unrelatedMask);
    expect(blockWorldGroundBoundaryCollideMaskV1(
      ground,
      "water-surface",
    )).toBe(flight);
    expect(blockWorldGroundBoundaryCollideMaskV1(
      ground,
      "underwater",
    )).toBe(flight);
    expect(blockWorldGroundBoundaryCollideMaskV1(
      ground,
      "powered-flight",
    )).toBe(flight);
  });

  it("does not derive a false ground boundary at a walkable chunk seam", () => {
    const block = (entityId: string, x: number): CanonicalSceneObjectV1 => ({
      entityId,
      prototypeId: "block-runtime-000",
      primitive: { kind: "box", sizeMetersXYZ: [1, 1, 1] },
      transform: {
        positionMetersXYZ: [x, 0, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1],
      },
      collisionEnabled: true,
      semanticClassId: "block.walkable.shape.full",
    });
    const topologies = buildBlockWalkableSurfaceTopologiesV1([
      block("bw-chunk-x-p0-z-p0-cluster-0000", 31.5),
      block("bw-chunk-x-p1-z-p0-cluster-0000", 32.5),
    ]);
    expect(topologies).toHaveLength(2);
    expect(topologies.flatMap(({ groundBoundarySegments }) =>
      groundBoundarySegments).some(({ startMetersXYZ, endMetersXYZ }) =>
      Math.abs(startMetersXYZ[0] - 32) < 1e-9 &&
      Math.abs(endMetersXYZ[0] - 32) < 1e-9)).toBe(false);
  });

  it("removes only the micro-area covered by a small solid detail", () => {
    const topologies = buildBlockWalkableSurfaceTopologiesV1([
      {
        entityId: "bw-chunk-x-p0-z-p0-cluster-0000",
        prototypeId: "block-full",
        primitive: { kind: "box", sizeMetersXYZ: [1, 1, 1] },
        transform: {
          positionMetersXYZ: [0, 0, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        collisionEnabled: true,
        semanticClassId: "block.walkable.shape.full",
      },
      {
        entityId: "bw-chunk-x-p0-z-p0-cluster-0001",
        prototypeId: "block-small",
        primitive: { kind: "box", sizeMetersXYZ: [0.5, 0.5, 0.5] },
        transform: {
          positionMetersXYZ: [0.25, 0.75, 0.25],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        collisionEnabled: true,
        semanticClassId: "block.obstacle.shape.small",
      },
    ]);
    expect(topologies).toHaveLength(1);
    expect(topologies[0]!.tileCount).toBe(3);
  });

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
    const object: CanonicalSceneObjectV1 = {
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

  it("renders Block Compiler objects with their immutable preset material", () => {
    const object: CanonicalSceneObjectV1 = {
      entityId: "block.walkable.001",
      prototypeId: "block-walkable",
      primitive: { kind: "box", sizeMetersXYZ: [1, 1, 1] },
      transform: IDENTITY_TRANSFORM,
      collisionEnabled: true,
      semanticClassId: "block.walkable",
    };
    const mesh = createBabylonObjectMeshV1(object, materials, scene);
    expect(mesh.material).toBe(materials.blockBySemanticClassId.get("block.walkable"));
    expect((mesh.material as typeof materials.object).diffuseColor.toHexString()).toBe(
      BLOCK_WORLD_PASTEL_DISPLAY_COLORS_V1.walkable,
    );
    expect((mesh.material as typeof materials.object).emissiveColor.toHexString()).toBe(
      "#060606",
    );
    expect((mesh.material as typeof materials.object).ambientColor.toHexString()).toBe(
      "#494A49",
    );
    expect((mesh.material as typeof materials.object).disableLighting).toBe(false);
    expect((mesh.material as typeof materials.object).metadata).toEqual({
      blockPresetRef: "worldkit://block-preset/walkable@1",
      blockPresetColorHex: BLOCK_PRESET_COLORS_V1.walkable,
      blockDisplayColorHex: BLOCK_WORLD_PASTEL_DISPLAY_COLORS_V1.walkable,
    });
  });

  it("batches Host-owned block clusters by chunk and visual identity", () => {
    const object = (
      entityId: string,
      semanticClassId: string,
      x: number,
    ): CanonicalSceneObjectV1 => ({
      entityId,
      prototypeId: "block-runtime-000",
      primitive: { kind: "box", sizeMetersXYZ: [1, 1, 1] },
      transform: {
        positionMetersXYZ: [x, 0, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [2, 1, 1],
      },
      collisionEnabled: true,
      semanticClassId,
    });
    const meshes = createBabylonObjectMeshesV1([
      object("bw-chunk-x-p0-z-p0-cluster-0000", "block.walkable", 0),
      object("bw-chunk-x-p0-z-p0-cluster-0001", "block.walkable", 3),
      object(
        "bw-chunk-x-p0-z-p0-cluster-0002",
        "block.walkable.visual-group.visual-target-2",
        7,
      ),
      object("generic-object", "object.generic", 12),
    ], materials, scene);
    expect(meshes).toHaveLength(3);
    const generic = meshes.find(({ metadata }) =>
      metadata?.worldkitEntityId === "generic-object");
    const walkableBatch = meshes.find(({ metadata }) =>
      Array.isArray(metadata?.worldkitEntityIds) && metadata.worldkitEntityIds.length === 2);
    expect(generic).toBeDefined();
    expect(walkableBatch?.thinInstanceCount).toBe(4);
    expect(walkableBatch?.metadata).toMatchObject({
      semanticClassId: "block.walkable",
      blockWorldChunkXZ: [0, 0],
      logicalClusterCount: 2,
      renderedBlockCount: 4,
    });
    expect(meshSize(walkableBatch!)).toEqual([
      expect.closeTo(4.985, 5),
      expect.closeTo(0.985, 5),
      expect.closeTo(0.985, 5),
    ]);
  });

  it("keeps walkable Block World ground uniformly material-colored", () => {
    const walkable = createBabylonObjectMeshesV1([{
      entityId: "bw-chunk-x-p0-z-p0-cluster-0000",
      prototypeId: "block-walkable",
      primitive: { kind: "box", sizeMetersXYZ: [1, 1, 1] },
      transform: {
        positionMetersXYZ: [0, 0, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 9],
      },
      collisionEnabled: true,
      semanticClassId: "block.walkable",
    }], materials, scene)[0]!;
    expect(walkable.isVerticesDataPresent(VertexBuffer.ColorInstanceKind)).toBe(false);

    const obstacle = createBabylonObjectMeshesV1([{
      entityId: "bw-chunk-x-p0-z-p0-cluster-0001",
      prototypeId: "block-obstacle",
      primitive: { kind: "box", sizeMetersXYZ: [1, 1, 1] },
      transform: {
        positionMetersXYZ: [0, 0, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 9],
      },
      collisionEnabled: true,
      semanticClassId: "block.obstacle",
    }], materials, scene)[0]!;
    expect(obstacle.isVerticesDataPresent(VertexBuffer.ColorInstanceKind)).toBe(false);
  });

  it("expands mixed-shape clusters with their exact base dimensions", () => {
    const meshes = createBabylonObjectMeshesV1([{
      entityId: "bw-chunk-x-p0-z-p0-cluster-0000",
      prototypeId: "block-half",
      primitive: { kind: "box", sizeMetersXYZ: [1, 0.5, 1] },
      transform: {
        positionMetersXYZ: [0.5, 0.25, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [2, 1, 1],
      },
      collisionEnabled: true,
      semanticClassId: "block.walkable.shape.half",
    }], materials, scene);
    expect(meshes).toHaveLength(1);
    expect(meshes[0]!.thinInstanceCount).toBe(2);
    expect(meshes[0]!.metadata).toMatchObject({
      renderedBlockCount: 2,
      logicalClusterCount: 1,
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
    const object = (entityId: string): CanonicalSceneObjectV1 => ({
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
