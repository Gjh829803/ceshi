import {
  Color,
  Mesh,
  MeshBasicMaterial,
  type Material,
} from "three";

import {
  resolveBlockPresetV1,
} from "@whitebox-world/block-world";

import type {
  WorldkitBlockBindingInputV1,
  WorldkitBlockBindingV1,
  WorldkitSubjectMeshBindingInputV1,
  WorldkitSubjectMeshBindingV1,
} from "./types.js";

const ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const BLOCK_BINDING_V1 = Symbol.for("worldkit.block-world-three.binding.v1");
const BLOCK_MATERIAL_BINDING_V1 = Symbol.for(
  "worldkit.block-world-three.material-binding.v1",
);
const SUBJECT_MESH_BINDING_V1 = Symbol.for(
  "worldkit.block-world-three.subject-mesh-binding.v1",
);
const SUBJECT_MATERIAL_BINDING_V1 = Symbol.for(
  "worldkit.block-world-three.subject-material-binding.v1",
);

type BoundMesh = Mesh & {
  readonly [BLOCK_BINDING_V1]?: WorldkitBlockBindingV1;
};

type BoundMaterial = Material & {
  readonly [BLOCK_MATERIAL_BINDING_V1]?: Readonly<{
    kind: "worldkit-three-block-material-binding";
    schemaVersion: 1;
    presetRef: string;
  }>;
};

type BoundSubjectMesh = Mesh & {
  readonly [SUBJECT_MESH_BINDING_V1]?: WorldkitSubjectMeshBindingV1;
};

type BoundSubjectMaterial = Material & {
  readonly [SUBJECT_MATERIAL_BINDING_V1]?: Readonly<{
    kind: "worldkit-three-subject-material-binding";
    schemaVersion: 1;
  }>;
};

function failBinding(message: string): never {
  throw new Error(`BLOCK_BINDING_INVALID: ${message}`);
}

export function createWorldkitBlockMaterialV1(
  presetRef: string,
): MeshBasicMaterial {
  const preset = resolveBlockPresetV1(presetRef);
  if (preset === undefined) failBinding(`unknown preset '${presetRef}'.`);
  const material = new MeshBasicMaterial({
    color: new Color(preset.render.colorHex),
    opacity: preset.render.opacityRatio,
    transparent: preset.render.opacityRatio < 1,
    depthWrite: preset.render.opacityRatio === 1,
    toneMapped: false,
  });
  Object.defineProperty(material, BLOCK_MATERIAL_BINDING_V1, {
    value: Object.freeze({
      kind: "worldkit-three-block-material-binding",
      schemaVersion: 1,
      presetRef: preset.resourceRef,
    }),
    writable: false,
    configurable: false,
    enumerable: false,
  });
  return material;
}

export function readWorldkitBlockMaterialPresetRefV1(
  material: Material,
): string | undefined {
  return (material as BoundMaterial)[BLOCK_MATERIAL_BINDING_V1]?.presetRef;
}

export function bindWorldkitBlockV1<TMesh extends Mesh>(
  mesh: TMesh,
  input: WorldkitBlockBindingInputV1,
): TMesh {
  if ((mesh as BoundMesh)[BLOCK_BINDING_V1] !== undefined ||
      (mesh as BoundSubjectMesh)[SUBJECT_MESH_BINDING_V1] !== undefined) {
    failBinding(`mesh '${mesh.name}' is already bound.`);
  }
  if (!ID.test(input.id)) {
    failBinding(`id '${input.id}' must be a stable lowercase WorldKit ID.`);
  }
  if (resolveBlockPresetV1(input.presetRef) === undefined) {
    failBinding(`unknown preset '${input.presetRef}'.`);
  }
  if (Array.isArray(mesh.material) ||
      readWorldkitBlockMaterialPresetRefV1(mesh.material) !== input.presetRef) {
    failBinding(
      `mesh '${input.id}' must use a WorldKit material created for '${input.presetRef}'.`,
    );
  }
  for (const [field, value] of [
    ["visualGroupId", input.visualGroupId],
    ["interactionInstanceId", input.interactionInstanceId],
    ["initialStateId", input.initialStateId],
  ] as const) {
    if (value !== undefined && !ID.test(value)) {
      failBinding(`${field} '${value}' must be a stable lowercase WorldKit ID.`);
    }
  }
  const binding: WorldkitBlockBindingV1 = Object.freeze({
    kind: "worldkit-three-block-binding",
    schemaVersion: 1,
    id: input.id,
    presetRef: input.presetRef,
    ...(input.visualGroupId === undefined ? {} : { visualGroupId: input.visualGroupId }),
    ...(input.interactionInstanceId === undefined
      ? {}
      : { interactionInstanceId: input.interactionInstanceId }),
    ...(input.initialStateId === undefined ? {} : { initialStateId: input.initialStateId }),
  });
  Object.defineProperty(mesh, BLOCK_BINDING_V1, {
    value: binding,
    writable: false,
    configurable: false,
    enumerable: false,
  });
  return mesh;
}

export function readWorldkitBlockBindingV1(
  mesh: Mesh,
): WorldkitBlockBindingV1 | undefined {
  return (mesh as BoundMesh)[BLOCK_BINDING_V1];
}

export function createWorldkitSubjectMaterialV1(): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    color: new Color("#ff334d"),
    transparent: false,
    opacity: 1,
    depthWrite: true,
    toneMapped: false,
  });
  Object.defineProperty(material, SUBJECT_MATERIAL_BINDING_V1, {
    value: Object.freeze({
      kind: "worldkit-three-subject-material-binding",
      schemaVersion: 1,
    }),
    writable: false,
    configurable: false,
    enumerable: false,
  });
  return material;
}

export function isWorldkitSubjectMaterialV1(material: Material): boolean {
  return (material as BoundSubjectMaterial)[SUBJECT_MATERIAL_BINDING_V1]?.kind ===
    "worldkit-three-subject-material-binding";
}

export function bindWorldkitSubjectMeshV1<TMesh extends Mesh>(
  mesh: TMesh,
  input: WorldkitSubjectMeshBindingInputV1,
): TMesh {
  if ((mesh as BoundSubjectMesh)[SUBJECT_MESH_BINDING_V1] !== undefined ||
      (mesh as BoundMesh)[BLOCK_BINDING_V1] !== undefined) {
    failBinding(`mesh '${mesh.name}' is already bound.`);
  }
  if (!ID.test(input.id)) {
    failBinding(`id '${input.id}' must be a stable lowercase WorldKit ID.`);
  }
  if ((mesh as Mesh & {
        readonly isSkinnedMesh?: boolean;
        readonly isInstancedMesh?: boolean;
      }).isSkinnedMesh === true ||
      (mesh as Mesh & { readonly isInstancedMesh?: boolean }).isInstancedMesh === true ||
      Object.keys(mesh.geometry.morphAttributes).length > 0) {
    failBinding(
      `subject mesh '${input.id}' must be rigid and cannot contain skinning, morph targets, or instancing.`,
    );
  }
  if (Array.isArray(mesh.material) || !isWorldkitSubjectMaterialV1(mesh.material)) {
    failBinding(
      `subject mesh '${input.id}' must use createWorldkitSubjectMaterialV1().`,
    );
  }
  if (input.semanticTags.length < 1 || input.semanticTags.length > 16 ||
      input.semanticTags.some((tag) =>
        !/^[a-z0-9][a-z0-9.-]{1,63}$/.test(tag))) {
    failBinding(`subject mesh '${input.id}' semanticTags are invalid.`);
  }
  const binding: WorldkitSubjectMeshBindingV1 = Object.freeze({
    kind: "worldkit-three-subject-mesh-binding",
    schemaVersion: 1,
    id: input.id,
    colliderContribution: input.colliderContribution ?? "exclude",
    semanticTags: Object.freeze([...input.semanticTags]),
  });
  Object.defineProperty(mesh, SUBJECT_MESH_BINDING_V1, {
    value: binding,
    writable: false,
    configurable: false,
    enumerable: false,
  });
  return mesh;
}

export function readWorldkitSubjectMeshBindingV1(
  mesh: Mesh,
): WorldkitSubjectMeshBindingV1 | undefined {
  return (mesh as BoundSubjectMesh)[SUBJECT_MESH_BINDING_V1];
}
