import type { Material } from "@babylonjs/core/Materials/material.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type { ExecutionSubjectV3, SubjectVisualPartV3 } from "@whitebox-world/runtime-contracts";

export interface SubjectVisual {
  root: TransformNode;
  meshes: readonly Mesh[];
}

function createPartMesh(subjectEntityId: string, part: SubjectVisualPartV3, scene: Scene): Mesh {
  const name = `${subjectEntityId}.${part.id}`;
  switch (part.shape.kind) {
    case "capsule":
      return MeshBuilder.CreateCapsule(
        name,
        {
          height: part.shape.heightMeters,
          radius: part.shape.radiusMeters,
          tessellation: 16,
        },
        scene,
      );
    case "box":
      return MeshBuilder.CreateBox(
        name,
        {
          width: part.shape.sizeMetersXYZ[0],
          height: part.shape.sizeMetersXYZ[1],
          depth: part.shape.sizeMetersXYZ[2],
        },
        scene,
      );
    case "sphere":
      return MeshBuilder.CreateSphere(
        name,
        { diameter: part.shape.radiusMeters * 2, segments: 16 },
        scene,
      );
    case "cylinder":
      return MeshBuilder.CreateCylinder(
        name,
        {
          height: part.shape.heightMeters,
          diameter: part.shape.radiusMeters * 2,
          tessellation: 16,
        },
        scene,
      );
  }
}

export function createSubjectVisual(
  subject: ExecutionSubjectV3,
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
    mesh.position = new Vector3(...part.localTransform.positionMetersXYZ);
    mesh.rotationQuaternion = Quaternion.FromEulerAngles(
      ...part.localTransform.rotationEulerRadiansXYZ,
    );
    mesh.material = material;
    mesh.metadata = {
      worldkitEntityId: subject.entityId,
      subjectVisualPartId: part.id,
      semanticClassId: subject.semanticClassId,
      semanticTags: [...part.semanticTags],
    };
    return mesh;
  });
  return { root, meshes };
}
