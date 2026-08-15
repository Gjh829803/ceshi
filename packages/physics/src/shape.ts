import RAPIER from "@dimforge/rapier3d-compat";
import type { ColliderShape } from "./types";

function requirePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }
}

function requireNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
}

function asFloat32(values: Float32Array | readonly number[]): Float32Array {
  return values instanceof Float32Array ? values : new Float32Array(values);
}

function asUint32(values: Uint32Array | readonly number[]): Uint32Array {
  return values instanceof Uint32Array ? values : new Uint32Array(values);
}

export function createColliderDesc(shape: ColliderShape): RAPIER.ColliderDesc {
  switch (shape.type) {
    case "box": {
      const [x, y, z] = shape.halfExtents;
      requirePositive(x, "box halfExtent.x");
      requirePositive(y, "box halfExtent.y");
      requirePositive(z, "box halfExtent.z");
      return RAPIER.ColliderDesc.cuboid(x, y, z);
    }
    case "sphere":
      requirePositive(shape.radius, "sphere radius");
      return RAPIER.ColliderDesc.ball(shape.radius);
    case "capsule":
      requireNonNegative(shape.halfHeight, "capsule halfHeight");
      requirePositive(shape.radius, "capsule radius");
      return RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius);
    case "cylinder":
      requirePositive(shape.halfHeight, "cylinder halfHeight");
      requirePositive(shape.radius, "cylinder radius");
      return RAPIER.ColliderDesc.cylinder(shape.halfHeight, shape.radius);
    case "cone":
      requirePositive(shape.halfHeight, "cone halfHeight");
      requirePositive(shape.radius, "cone radius");
      return RAPIER.ColliderDesc.cone(shape.halfHeight, shape.radius);
    case "trimesh": {
      const vertices = asFloat32(shape.vertices);
      const indices = asUint32(shape.indices);
      if (vertices.length === 0 || vertices.length % 3 !== 0) {
        throw new Error("trimesh vertices must contain complete xyz triples.");
      }
      if (indices.length === 0 || indices.length % 3 !== 0) {
        throw new Error("trimesh indices must contain complete triangles.");
      }
      const vertexCount = vertices.length / 3;
      for (const index of indices) {
        if (index >= vertexCount) {
          throw new Error(`trimesh index ${index} is outside ${vertexCount} vertices.`);
        }
      }
      return RAPIER.ColliderDesc.trimesh(vertices, indices);
    }
    case "heightfield": {
      if (!Number.isInteger(shape.rows) || shape.rows < 1) {
        throw new Error("heightfield rows must be a positive integer.");
      }
      if (!Number.isInteger(shape.columns) || shape.columns < 1) {
        throw new Error("heightfield columns must be a positive integer.");
      }
      const heights = asFloat32(shape.heights);
      // Rapier describes rows/columns as the number of cells. The vertex
      // matrix therefore has one additional sample along each axis.
      const expected = (shape.rows + 1) * (shape.columns + 1);
      if (heights.length !== expected) {
        throw new Error(
          `heightfield requires ${expected} heights for ${shape.rows} x ${shape.columns} cells; received ${heights.length}.`,
        );
      }
      const [x, y, z] = shape.scale;
      requirePositive(x, "heightfield scale.x");
      requirePositive(y, "heightfield scale.y");
      requirePositive(z, "heightfield scale.z");
      // The public API follows the terrain package's conventional z-major
      // row order. Rapier/nalgebra expects its matrix in column-major order.
      const rapierHeights = new Float32Array(expected);
      const samplesPerRow = shape.columns + 1;
      const samplesPerColumn = shape.rows + 1;
      for (let row = 0; row < samplesPerColumn; row += 1) {
        for (let column = 0; column < samplesPerRow; column += 1) {
          rapierHeights[column * samplesPerColumn + row] =
            heights[row * samplesPerRow + column] ?? 0;
        }
      }
      return RAPIER.ColliderDesc.heightfield(
        shape.rows,
        shape.columns,
        rapierHeights,
        { x, y, z },
      );
    }
  }
}
