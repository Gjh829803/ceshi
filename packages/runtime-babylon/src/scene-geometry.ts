import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import type {
  ExecutionObjectV3,
  ExecutionWaterV3,
} from "@whitebox-world/runtime-contracts";

import type { WhiteboxMaterials } from "./materials.js";
import { triangulatePolygonMetersXZV1 } from "./polygon-triangulation.js";

function applyTransform(mesh: Mesh, object: ExecutionObjectV3): void {
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
  object: ExecutionObjectV3,
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
  mesh.material = materials.object;
  return mesh;
}

export function createBabylonWaterMeshV1(
  water: ExecutionWaterV3,
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
