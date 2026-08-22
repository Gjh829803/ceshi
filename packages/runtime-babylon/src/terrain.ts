import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type { ExecutionTerrainV3 } from "@whitebox-world/runtime-contracts";
import {
  emitTriangleHeightfieldSurfaceV1,
  sampleTriangleHeightfieldSurface,
} from "@whitebox-world/terrain-surface";

export function createTerrainMesh(
  terrain: ExecutionTerrainV3,
  material: StandardMaterial,
  scene: Scene,
): Mesh {
  const [columns, rows] = terrain.resolutionCellsXZ;
  const topology = emitTriangleHeightfieldSurfaceV1({
    centerMetersXZ: terrain.centerMetersXZ,
    sizeMetersXZ: terrain.sizeMetersXZ,
    resolutionVerticesXZ: terrain.resolutionCellsXZ,
    heightSamplesMeters: terrain.heightSamplesMeters,
  });
  const mesh = new Mesh(terrain.entityId, scene);
  const positions = [...topology.localPositionsMetersXYZ];
  const indices = [...topology.triangleIndices];
  const uvs: number[] = [];

  for (let zIndex = 0; zIndex < rows; zIndex += 1) {
    for (let xIndex = 0; xIndex < columns; xIndex += 1) {
      uvs.push(xIndex / (columns - 1), zIndex / (rows - 1));
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
  mesh.position = new Vector3(...topology.originMetersXYZ);
  mesh.material = material;
  mesh.receiveShadows = true;
  mesh.metadata = { worldkitEntityId: terrain.entityId, semanticClassId: terrain.semanticClassId };
  return mesh;
}

/**
 * Babylon's Havok adapter rewrites its legacy heightfield input once, while
 * Havok indexes the resulting buffer X-major. Encode the engine-neutral
 * row-major XZ samples so the physical height at (x, z) matches the rendered
 * terrain vertex at that same coordinate. Rectangular grids use the exact
 * rendered triangle mesh as their collider because Babylon 9.21 swaps the
 * heightfield sample axes when the dimensions differ.
 */
export function toBabylonHeightfieldData(terrain: ExecutionTerrainV3): Float32Array {
  const [columns, rows] = terrain.resolutionCellsXZ;
  const result = new Float32Array(columns * rows);
  for (let worldX = 0; worldX < columns; worldX += 1) {
    for (let worldZ = 0; worldZ < rows; worldZ += 1) {
      const havokReadIndex = worldX * rows + worldZ;
      const pluginZ = Math.floor(havokReadIndex / columns);
      const pluginX = havokReadIndex % columns;
      const babylonInputIndex = (columns - 1 - pluginX) * rows + pluginZ;
      result[babylonInputIndex] =
        terrain.heightSamplesMeters[worldZ * columns + worldX] ?? 0;
    }
  }
  return result;
}

export function sampleExecutionTerrainHeight(
  terrain: ExecutionTerrainV3,
  x: number,
  z: number,
): number {
  const minimumX = terrain.centerMetersXZ[0] - terrain.sizeMetersXZ[0] / 2;
  const minimumZ = terrain.centerMetersXZ[1] - terrain.sizeMetersXZ[1] / 2;
  const maximumX = minimumX + terrain.sizeMetersXZ[0];
  const maximumZ = minimumZ + terrain.sizeMetersXZ[1];
  return sampleTriangleHeightfieldSurface(
    {
      centerMetersXZ: terrain.centerMetersXZ,
      sizeMetersXZ: terrain.sizeMetersXZ,
      resolutionVerticesXZ: terrain.resolutionCellsXZ,
      heightSamplesMeters: terrain.heightSamplesMeters,
    },
    [
      Math.max(minimumX, Math.min(maximumX, x)),
      Math.max(minimumZ, Math.min(maximumZ, z)),
    ],
  )!.heightMeters;
}
