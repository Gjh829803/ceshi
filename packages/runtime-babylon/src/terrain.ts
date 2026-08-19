import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type { ExecutionTerrainV3 } from "@whitebox-world/runtime-contracts";

export function createTerrainMesh(
  terrain: ExecutionTerrainV3,
  material: StandardMaterial,
  scene: Scene,
): Mesh {
  const mesh = new Mesh(terrain.entityId, scene);
  const [columns, rows] = terrain.resolutionCellsXZ;
  const [sizeX, sizeZ] = terrain.sizeMetersXZ;
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];

  for (let zIndex = 0; zIndex < rows; zIndex += 1) {
    for (let xIndex = 0; xIndex < columns; xIndex += 1) {
      const height = terrain.heightSamplesMeters[zIndex * columns + xIndex] ?? 0;
      positions.push((xIndex / (columns - 1)) * sizeX, height, (zIndex / (rows - 1)) * sizeZ);
      uvs.push(xIndex / (columns - 1), zIndex / (rows - 1));
    }
  }
  for (let zIndex = 0; zIndex < rows - 1; zIndex += 1) {
    for (let xIndex = 0; xIndex < columns - 1; xIndex += 1) {
      const topLeft = zIndex * columns + xIndex;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + columns;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.uvs = uvs;
  vertexData.applyToMesh(mesh, false);
  mesh.position = new Vector3(
    terrain.centerMetersXZ[0] - sizeX / 2,
    0,
    terrain.centerMetersXZ[1] - sizeZ / 2,
  );
  mesh.material = material;
  mesh.receiveShadows = true;
  mesh.metadata = { worldkitEntityId: terrain.entityId, semanticClassId: terrain.semanticClassId };
  return mesh;
}

/**
 * Babylon's Havok adapter accepts heightfield data in a legacy x-major layout
 * and converts it to Havok's row-major layout. The ExecutionPlan remains
 * engine-neutral row-major, so the adapter performs the explicit conversion.
 */
export function toBabylonHeightfieldData(terrain: ExecutionTerrainV3): Float32Array {
  const [columns, rows] = terrain.resolutionCellsXZ;
  const result = new Float32Array(columns * rows);
  for (let x = 0; x < columns; x += 1) {
    for (let z = 0; z < rows; z += 1) {
      result[x * rows + z] = terrain.heightSamplesMeters[z * columns + (columns - 1 - x)] ?? 0;
    }
  }
  return result;
}

export function sampleExecutionTerrainHeight(terrain: ExecutionTerrainV3, x: number, z: number): number {
  const [columns, rows] = terrain.resolutionCellsXZ;
  const minimumX = terrain.centerMetersXZ[0] - terrain.sizeMetersXZ[0] / 2;
  const minimumZ = terrain.centerMetersXZ[1] - terrain.sizeMetersXZ[1] / 2;
  const column = Math.max(0, Math.min(columns - 1, ((x - minimumX) / terrain.sizeMetersXZ[0]) * (columns - 1)));
  const row = Math.max(0, Math.min(rows - 1, ((z - minimumZ) / terrain.sizeMetersXZ[1]) * (rows - 1)));
  const x0 = Math.floor(column);
  const z0 = Math.floor(row);
  const x1 = Math.min(columns - 1, x0 + 1);
  const z1 = Math.min(rows - 1, z0 + 1);
  const tx = column - x0;
  const tz = row - z0;
  const at = (columnIndex: number, rowIndex: number): number =>
    terrain.heightSamplesMeters[rowIndex * columns + columnIndex] ?? 0;
  const top = at(x0, z0) + (at(x1, z0) - at(x0, z0)) * tx;
  const bottom = at(x0, z1) + (at(x1, z1) - at(x0, z1)) * tx;
  return top + (bottom - top) * tz;
}
