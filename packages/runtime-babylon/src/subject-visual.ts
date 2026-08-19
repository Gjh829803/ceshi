import type { Material } from "@babylonjs/core/Materials/material.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type { ExecutionSubjectV2, SubjectVisualPartV2 } from "@whitebox-world/runtime-contracts";

export interface SubjectVisual {
  root: TransformNode;
  meshes: readonly Mesh[];
}

function createPartMesh(subjectEntityId: string, part: SubjectVisualPartV2, scene: Scene): Mesh {
  const name = `${subjectEntityId}.${part.id}`;
  switch (part.primitive.kind) {
    case "capsule":
      return MeshBuilder.CreateCapsule(
        name,
        {
          height: part.primitive.heightMeters,
          radius: part.primitive.radiusMeters,
          tessellation: 16,
        },
        scene,
      );
    case "box":
      return MeshBuilder.CreateBox(
        name,
        {
          width: part.primitive.sizeMetersXYZ[0],
          height: part.primitive.sizeMetersXYZ[1],
          depth: part.primitive.sizeMetersXYZ[2],
        },
        scene,
      );
    case "sphere":
      return MeshBuilder.CreateSphere(
        name,
        { diameter: part.primitive.radiusMeters * 2, segments: 16 },
        scene,
      );
    case "cylinder":
      return MeshBuilder.CreateCylinder(
        name,
        {
          height: part.primitive.heightMeters,
          diameter: part.primitive.radiusMeters * 2,
          tessellation: 16,
        },
        scene,
      );
  }
}

export function createSubjectVisual(
  subject: ExecutionSubjectV2,
  material: Material,
  scene: Scene,
): SubjectVisual {
  const root = new TransformNode(`${subject.entityId}.visual-root`, scene);
  root.metadata = {
    worldkitEntityId: subject.entityId,
    semanticClassId: subject.semanticClassId,
  };
  const meshes = subject.visualParts.map((part) => {
    const mesh = createPartMesh(subject.entityId, part, scene);
    mesh.parent = root;
    mesh.position = new Vector3(...part.localPositionMeters);
    mesh.rotationQuaternion = Quaternion.FromEulerAngles(...part.localRotationEulerRadiansXYZ);
    mesh.material = material;
    mesh.metadata = {
      worldkitEntityId: subject.entityId,
      subjectVisualPartId: part.id,
      semanticClassId: subject.semanticClassId,
    };
    return mesh;
  });
  return { root, meshes };
}
