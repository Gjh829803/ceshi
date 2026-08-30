import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import type {
  CanonicalSceneObjectV1,
  CanonicalSceneWaterV1,
} from "@whitebox-world/runtime-contracts";
import { parseBlockWorldChunkEntityIdV2 } from "@whitebox-world/block-world";
import { groupBy } from "lodash-es";

import {
  blockWorldGroundStripeColorMultiplierV1,
  registerBlockWorldGroundStripeInstanceColorsV1,
} from "./block-ground-stripe.js";
import type { WhiteboxMaterials } from "./materials.js";
import { triangulatePolygonMetersXZV1 } from "./polygon-triangulation.js";

function applyTransform(mesh: Mesh, object: CanonicalSceneObjectV1): void {
  mesh.position = new Vector3(...object.transform.positionMetersXYZ);
  const [rotationX, rotationY, rotationZ] =
    object.transform.rotationEulerRadiansXYZ;
  mesh.rotationQuaternion = Quaternion.FromEulerAngles(
    rotationX,
    rotationY,
    rotationZ,
  );
  mesh.scaling = new Vector3(...object.transform.scaleXYZ);
  mesh.metadata = {
    worldkitEntityId: object.entityId,
    semanticClassId: object.semanticClassId,
  };
}

export function createBabylonObjectMeshV1(
  object: CanonicalSceneObjectV1,
  materials: WhiteboxMaterials,
  scene: Scene,
): Mesh {
  let mesh: Mesh;
  switch (object.primitive.kind) {
    case "box":
      mesh = MeshBuilder.CreateBox(object.entityId, {
        width: object.primitive.sizeMetersXYZ[0],
        height: object.primitive.sizeMetersXYZ[1],
        depth: object.primitive.sizeMetersXYZ[2],
      }, scene);
      break;
    case "sphere":
      mesh = MeshBuilder.CreateSphere(object.entityId, {
        diameter: object.primitive.radiusMeters * 2,
        segments: 16,
      }, scene);
      break;
    case "cylinder":
      mesh = MeshBuilder.CreateCylinder(object.entityId, {
        height: object.primitive.heightMeters,
        diameter: object.primitive.radiusMeters * 2,
        tessellation: 24,
      }, scene);
      break;
    case "cone":
      mesh = MeshBuilder.CreateCylinder(object.entityId, {
        height: object.primitive.heightMeters,
        diameterBottom: object.primitive.radiusMeters * 2,
        diameterTop: 0,
        tessellation: 24,
      }, scene);
      break;
  }
  applyTransform(mesh, object);
  mesh.material = blockMaterial(object.semanticClassId, materials);
  return mesh;
}

function blockMaterial(
  semanticClassId: string,
  materials: WhiteboxMaterials,
) {
  if (!semanticClassId.startsWith("block.")) return materials.object;
  const presetSemanticClassId = semanticClassId.split(".").slice(0, 2).join(".");
  return materials.blockBySemanticClassId.get(presetSemanticClassId) ?? materials.object;
}

function blockBatchKey(object: CanonicalSceneObjectV1): string | undefined {
  const chunk = parseBlockWorldChunkEntityIdV2(object.entityId);
  return chunk === undefined
    ? undefined
    : `${chunk.chunkX},${chunk.chunkZ}\u0000${object.semanticClassId}`;
}

function isWalkableBlockSemanticClassId(semanticClassId: string): boolean {
  return semanticClassId === "block.walkable" ||
    semanticClassId.startsWith("block.walkable.");
}

const BLOCK_RENDER_CUBE_SCALE_V1 = 0.985;

export function blockClusterTransformsV2(object: CanonicalSceneObjectV1): readonly Readonly<{
  positionMetersXYZ: readonly [number, number, number];
  scaleXYZ: readonly [number, number, number];
}>[] {
  const repeatCount = object.transform.scaleXYZ;
  const rotation = object.transform.rotationEulerRadiansXYZ;
  const isAdmittedCluster = object.primitive.kind === "box" &&
    object.primitive.sizeMetersXYZ.every((value) => value === 0.5 || value === 1) &&
    repeatCount.every((value) => Number.isSafeInteger(value) && value > 0) &&
    rotation.every((value) => value === 0);
  if (!isAdmittedCluster) throw new Error(
    `BLOCK_WORLD_RUNTIME_CLUSTER_INVALID: ${object.entityId}`,
  );
  if (object.primitive.kind !== "box") throw new Error(
    `BLOCK_WORLD_RUNTIME_CLUSTER_INVALID: ${object.entityId}`,
  );
  const output = [];
  const baseSize = object.primitive.sizeMetersXYZ;
  const minimum = repeatCount.map((value, axis) =>
    object.transform.positionMetersXYZ[axis]! - (value - 1) * baseSize[axis]! / 2
  ) as [number, number, number];
  for (let y = 0; y < repeatCount[1]; y += 1) {
    for (let z = 0; z < repeatCount[2]; z += 1) {
      for (let x = 0; x < repeatCount[0]; x += 1) {
        output.push(Object.freeze({
          positionMetersXYZ: Object.freeze([
            minimum[0] + x * baseSize[0],
            minimum[1] + y * baseSize[1],
            minimum[2] + z * baseSize[2],
          ]) as readonly [number, number, number],
          scaleXYZ: Object.freeze([
            baseSize[0] * BLOCK_RENDER_CUBE_SCALE_V1,
            baseSize[1] * BLOCK_RENDER_CUBE_SCALE_V1,
            baseSize[2] * BLOCK_RENDER_CUBE_SCALE_V1,
          ]) as readonly [number, number, number],
        }));
      }
    }
  }
  return output;
}

export function createBabylonObjectMeshesV1(
  objects: readonly CanonicalSceneObjectV1[],
  materials: WhiteboxMaterials,
  scene: Scene,
): readonly Mesh[] {
  const genericObjects: CanonicalSceneObjectV1[] = [];
  const blockObjects: CanonicalSceneObjectV1[] = [];
  for (const object of objects) {
    if (blockBatchKey(object) === undefined) genericObjects.push(object);
    else blockObjects.push(object);
  }
  const meshes = genericObjects.map((object) =>
    createBabylonObjectMeshV1(object, materials, scene));
  const batches = groupBy(blockObjects, (object) => blockBatchKey(object)!);
  for (const [batchIndex, key] of Object.keys(batches).sort().entries()) {
    const batch = [...(batches[key] ?? [])].sort((left, right) =>
      left.entityId.localeCompare(right.entityId));
    if (batch.length === 0) continue;
    const first = batch[0]!;
    const chunk = parseBlockWorldChunkEntityIdV2(first.entityId)!;
    const transforms = batch.flatMap(blockClusterTransformsV2);
    const mesh = MeshBuilder.CreateBox(
      `worldkit.block-batch.${batchIndex.toString(36)}`,
      { size: 1 },
      scene,
    );
    const matrixBuffer = new Float32Array(transforms.length * 16);
    for (const [index, transform] of transforms.entries()) {
      const offset = index * 16;
      matrixBuffer[offset] = transform.scaleXYZ[0];
      matrixBuffer[offset + 5] = transform.scaleXYZ[1];
      matrixBuffer[offset + 10] = transform.scaleXYZ[2];
      matrixBuffer[offset + 12] = transform.positionMetersXYZ[0];
      matrixBuffer[offset + 13] = transform.positionMetersXYZ[1];
      matrixBuffer[offset + 14] = transform.positionMetersXYZ[2];
      matrixBuffer[offset + 15] = 1;
    }
    mesh.thinInstanceSetBuffer("matrix", matrixBuffer, 16, true);
    if (isWalkableBlockSemanticClassId(first.semanticClassId)) {
      const colorBuffer = new Float32Array(transforms.length * 4);
      for (const [index, transform] of transforms.entries()) {
        colorBuffer.set(
          blockWorldGroundStripeColorMultiplierV1(transform.positionMetersXYZ),
          index * 4,
        );
      }
      registerBlockWorldGroundStripeInstanceColorsV1(mesh, colorBuffer);
    }
    mesh.thinInstanceRefreshBoundingInfo(true);
    mesh.material = blockMaterial(first.semanticClassId, materials);
    mesh.metadata = {
      worldkitEntityId: first.entityId,
      worldkitEntityIds: Object.freeze(batch.map(({ entityId }) => entityId)),
      semanticClassId: first.semanticClassId,
      blockWorldChunkXZ: Object.freeze([chunk.chunkX, chunk.chunkZ]),
      logicalClusterCount: batch.length,
      renderedBlockCount: transforms.length,
    };
    meshes.push(mesh);
  }
  return Object.freeze(meshes);
}

export function createBabylonWaterMeshV1(
  water: CanonicalSceneWaterV1,
  materials: WhiteboxMaterials,
  scene: Scene,
): Mesh {
  const boundary = water.boundary;
  let mesh: Mesh;
  if (boundary.kind === "circle" || boundary.kind === "ellipse") {
    mesh = MeshBuilder.CreateDisc(water.entityId, {
      radius: 1,
      tessellation: 64,
      sideOrientation: Mesh.DOUBLESIDE,
    }, scene);
    mesh.rotation.x = Math.PI / 2;
    const radii = boundary.kind === "circle"
      ? [boundary.radiusMeters, boundary.radiusMeters] as const
      : boundary.radiusMetersXZ;
    mesh.scaling.x = radii[0];
    mesh.scaling.y = radii[1];
    mesh.position = new Vector3(
      boundary.centerMetersXZ[0],
      water.waterLevelMeters,
      boundary.centerMetersXZ[1],
    );
  } else {
    mesh = new Mesh(water.entityId, scene);
    const positions = boundary.pointsMetersXZ.flatMap((point) => [
      point[0],
      water.waterLevelMeters,
      point[1],
    ]);
    const indices = [...triangulatePolygonMetersXZV1(boundary.pointsMetersXZ)];
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.applyToMesh(mesh, false);
  }
  mesh.material = materials.water;
  mesh.metadata = {
    worldkitEntityId: water.entityId,
    semanticClassId: water.semanticClassId,
  };
  return mesh;
}
