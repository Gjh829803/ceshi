import { describe, expect, it } from "vitest";

import {
  emitStaticColliderTriangleMeshV1,
  emitTransformedStaticColliderTriangleMeshV1,
  queryStaticColliderTriangleMeshSupportHeightMetersV1,
} from "./static-collider-triangle-mesh.js";

function minimumFacePlaneDistance(
  positions: readonly number[],
  indices: readonly number[],
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const point = (corner: number) => {
      const index = indices[offset + corner]! * 3;
      return [
        positions[index]!,
        positions[index + 1]!,
        positions[index + 2]!,
      ] as const;
    };
    const a = point(0);
    const b = point(1);
    const c = point(2);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ] as const;
    minimum = Math.min(
      minimum,
      Math.abs(normal[0] * a[0] + normal[1] * a[1] + normal[2] * a[2]) /
        Math.hypot(...normal),
    );
  }
  return minimum;
}

describe("emitStaticColliderTriangleMeshV1", () => {
  it("emits the canonical centered box topology and returns deeply frozen data", () => {
    const mesh = emitStaticColliderTriangleMeshV1({
      kind: "box",
      sizeMetersXYZ: [2, 4, 6],
    });

    expect(mesh).toEqual({
      localPositionsMetersXYZ: [
        -1, -2, -3, 1, -2, -3, 1, 2, -3, -1, 2, -3,
        -1, -2, 3, 1, -2, 3, 1, 2, 3, -1, 2, 3,
      ],
      triangleIndices: [
        0, 3, 2, 0, 2, 1,
        4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4,
        3, 7, 6, 3, 6, 2,
        0, 4, 7, 0, 7, 3,
        1, 2, 6, 1, 6, 5,
      ],
    });
    expect(Object.isFrozen(mesh)).toBe(true);
    expect(Object.isFrozen(mesh.localPositionsMetersXYZ)).toBe(true);
    expect(Object.isFrozen(mesh.triangleIndices)).toBe(true);
  });

  it("emits the locked 24-sided circumscribed closed cylinder", () => {
    const mesh = emitStaticColliderTriangleMeshV1({
      kind: "cylinder",
      radiusMeters: 1,
      heightMeters: 2,
    });

    expect(mesh.localPositionsMetersXYZ).toHaveLength((24 * 2 + 2) * 3);
    expect(mesh.triangleIndices).toHaveLength(24 * 4 * 3);
    expect(minimumFacePlaneDistance(
      mesh.localPositionsMetersXYZ,
      mesh.triangleIndices,
    )).toBeGreaterThanOrEqual(1 - 1e-9);
  });

  it("emits the locked level-2 circumscribed icosphere", () => {
    const mesh = emitStaticColliderTriangleMeshV1({
      kind: "sphere",
      radiusMeters: 1,
    });

    expect(mesh.triangleIndices).toHaveLength(20 * 4 ** 2 * 3);
    expect(minimumFacePlaneDistance(
      mesh.localPositionsMetersXYZ,
      mesh.triangleIndices,
    )).toBeGreaterThanOrEqual(1 - 1e-9);
  });

  it("rejects invalid dimensions, non-finite values, and unknown shape kinds", () => {
    expect(() => emitStaticColliderTriangleMeshV1({
      kind: "box",
      sizeMetersXYZ: [1, 0, 1],
    })).toThrow("STATIC_COLLIDER_TRIANGLE_MESH_INPUT_INVALID");
    expect(() => emitStaticColliderTriangleMeshV1({
      kind: "sphere",
      radiusMeters: Number.NaN,
    })).toThrow("STATIC_COLLIDER_TRIANGLE_MESH_INPUT_INVALID");
    expect(() => emitStaticColliderTriangleMeshV1({
      kind: "capsule",
      radiusMeters: 1,
      heightMeters: 2,
    } as never)).toThrow("STATIC_COLLIDER_TRIANGLE_MESH_INPUT_INVALID");
    expect(() => emitStaticColliderTriangleMeshV1({
      kind: "box",
      sizeMetersXYZ: [1, 1, 1],
      providerShapeId: 7,
    } as never)).toThrow("STATIC_COLLIDER_TRIANGLE_MESH_INPUT_INVALID");
  });

  it("applies canonical full TRS before exact vertical support sampling", () => {
    const mesh = emitTransformedStaticColliderTriangleMeshV1(
      { kind: "box", sizeMetersXYZ: [2, 2, 2] },
      {
        positionMetersXYZ: [4, 5, 6],
        rotationEulerRadiansXYZ: [0, 0, Math.PI / 2],
        scaleXYZ: [2, 3, 4],
      },
    );

    expect(queryStaticColliderTriangleMeshSupportHeightMetersV1(
      mesh,
      [4, 6],
    )).toBeCloseTo(7, 10);
    expect(queryStaticColliderTriangleMeshSupportHeightMetersV1(
      mesh,
      [100, 100],
    )).toBeUndefined();
    expect(Object.isFrozen(mesh)).toBe(true);
    expect(Object.isFrozen(mesh.worldPositionsMetersXYZ)).toBe(true);
  });

  it("emits hand-checked world vertices for offset XYZ rotation and non-uniform scale", () => {
    const canonicalWorldMesh = emitTransformedStaticColliderTriangleMeshV1(
      { kind: "box", sizeMetersXYZ: [2, 2, 2] },
      {
        positionMetersXYZ: [1, 2, 0.5],
        rotationEulerRadiansXYZ: [Math.PI / 2, Math.PI / 2, Math.PI / 2],
        scaleXYZ: [2, 3, 4],
      },
    );
    const expectedWorldPositionsMetersXYZ = [
      -1, 6, -2.5, 3, 6, -2.5, 3, 6, 3.5, -1, 6, 3.5,
      -1, -2, -2.5, 3, -2, -2.5, 3, -2, 3.5, -1, -2, 3.5,
    ];

    expect(canonicalWorldMesh.worldPositionsMetersXYZ).toHaveLength(
      expectedWorldPositionsMetersXYZ.length,
    );
    canonicalWorldMesh.worldPositionsMetersXYZ.forEach((value, index) => {
      expect(value).toBeCloseTo(expectedWorldPositionsMetersXYZ[index]!, 12);
    });
  });

  it("rejects non-finite and non-positive canonical transforms", () => {
    expect(() => emitTransformedStaticColliderTriangleMeshV1(
      { kind: "box", sizeMetersXYZ: [1, 1, 1] },
      {
        positionMetersXYZ: [0, Number.NaN, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1],
      },
    )).toThrow("STATIC_COLLIDER_TRIANGLE_MESH_INPUT_INVALID");
    expect(() => emitTransformedStaticColliderTriangleMeshV1(
      { kind: "box", sizeMetersXYZ: [1, 1, 1] },
      {
        positionMetersXYZ: [0, 0, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 0, 1],
      },
    )).toThrow("STATIC_COLLIDER_TRIANGLE_MESH_INPUT_INVALID");
  });
});
