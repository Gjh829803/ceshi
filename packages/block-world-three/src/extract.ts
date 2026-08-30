import {
  BoxGeometry,
  Color,
  Euler,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Scene,
  Vector3,
} from "three";

import {
  BLOCK_SHAPE_SIZE_METERS_XYZ_V2,
  blockPositionAlignsToLatticeV2,
  createBlockWorldManifestV2,
  resolveBlockPresetV1,
  type BlockInstanceV2,
  type BlockPositionMetersXYZV2,
  type BlockShapeKindV2,
  type BlockWorldDiagnosticV2,
} from "@whitebox-world/block-world";

import {
  readWorldkitBlockBindingV1,
  readWorldkitBlockMaterialPresetRefV1,
} from "./binding.js";
import type { ExtractThreeBlockWorldResultV2 } from "./types.js";

const EPSILON = 1e-6;

function close(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPSILON;
}

function diagnostic(
  code: BlockWorldDiagnosticV2["code"],
  instancePath: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): BlockWorldDiagnosticV2 {
  return Object.freeze({
    severity: "error",
    code,
    instancePath,
    message,
    ...(details === undefined ? {} : { details: Object.freeze({ ...details }) }),
  });
}

function blockShape(geometry: unknown): BlockShapeKindV2 | undefined {
  if (!(geometry instanceof BoxGeometry)) return undefined;
  const matched = (Object.entries(BLOCK_SHAPE_SIZE_METERS_XYZ_V2) as Array<
    [BlockShapeKindV2, readonly [number, number, number]]
  >).find(([, size]) =>
    close(geometry.parameters.width, size[0]) &&
    close(geometry.parameters.height, size[1]) &&
    close(geometry.parameters.depth, size[2]));
  if (matched === undefined) return undefined;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const size = matched[1];
  if (bounds === null || [0, 1, 2].some((axis) => {
    const minimum = [bounds.min.x, bounds.min.y, bounds.min.z][axis]!;
    const maximum = [bounds.max.x, bounds.max.y, bounds.max.z][axis]!;
    return !close(minimum, -size[axis]! / 2) || !close(maximum, size[axis]! / 2);
  })) return undefined;
  const positions = geometry.getAttribute("position");
  if (positions === undefined) return undefined;
  for (let index = 0; index < positions.count; index += 1) {
    if (![positions.getX(index), positions.getY(index), positions.getZ(index)]
      .every((value, axis) => close(Math.abs(value), size[axis]! / 2))) return undefined;
  }
  return matched[0];
}

function validMaterial(mesh: Mesh, presetRef: string): boolean {
  if (Array.isArray(mesh.material) || !(mesh.material instanceof MeshBasicMaterial)) return false;
  const preset = resolveBlockPresetV1(presetRef);
  return preset !== undefined &&
    readWorldkitBlockMaterialPresetRefV1(mesh.material) === presetRef &&
    mesh.material.color.equals(new Color(preset.render.colorHex)) &&
    close(mesh.material.opacity, preset.render.opacityRatio) &&
    mesh.material.transparent === (preset.render.opacityRatio < 1) &&
    mesh.material.depthWrite === (preset.render.opacityRatio === 1) &&
    mesh.material.toneMapped === false;
}

function worldPositionMeters(mesh: Mesh): BlockPositionMetersXYZV2 | undefined {
  const position = mesh.getWorldPosition(new Vector3());
  const quantized = [position.x, position.y, position.z].map((value) =>
    Math.round(value * 4) / 4);
  if (![position.x, position.y, position.z]
    .every((value, index) => close(value, quantized[index]!))) return undefined;
  return quantized.map((value) => Object.is(value, -0) ? 0 : value) as unknown as
    BlockPositionMetersXYZV2;
}

function validWorldScale(mesh: Mesh): boolean {
  const scale = mesh.getWorldScale(new Vector3());
  return close(scale.x, 1) && close(scale.y, 1) && close(scale.z, 1);
}

function worldQuarterTurnsY(mesh: Mesh): number | undefined {
  const quaternion = mesh.getWorldQuaternion(new Quaternion()).normalize();
  const up = new Vector3(0, 1, 0).applyQuaternion(quaternion);
  if (!close(up.x, 0) || !close(up.y, 1) || !close(up.z, 0)) return undefined;
  const euler = new Euler().setFromQuaternion(quaternion, "YXZ");
  if (!close(euler.x, 0) || !close(euler.z, 0)) return undefined;
  const rawQuarterTurns = Math.round(euler.y / (Math.PI / 2));
  const expected = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    rawQuarterTurns * Math.PI / 2,
  );
  if (1 - Math.abs(quaternion.dot(expected)) > EPSILON) return undefined;
  return ((rawQuarterTurns % 4) + 4) % 4;
}

function freezeDiagnostics(
  diagnostics: readonly BlockWorldDiagnosticV2[],
): readonly BlockWorldDiagnosticV2[] {
  return Object.freeze([...diagnostics].sort((left, right) =>
    left.instancePath.localeCompare(right.instancePath) ||
    left.code.localeCompare(right.code)));
}

export function extractThreeBlockWorldV2(scene: Scene): ExtractThreeBlockWorldResultV2 {
  scene.updateMatrixWorld(true);
  const diagnostics: BlockWorldDiagnosticV2[] = [];
  const blocks: BlockInstanceV2[] = [];
  let meshIndex = 0;
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const path = `/scene/meshes/${meshIndex}`;
    meshIndex += 1;
    const binding = readWorldkitBlockBindingV1(object);
    if (binding === undefined) {
      diagnostics.push(diagnostic(
        "BLOCK_MESH_UNBOUND",
        path,
        `Three.js Mesh '${object.name}' is not bound to a WorldKit block preset.`,
      ));
      return;
    }
    if (resolveBlockPresetV1(binding.presetRef) === undefined) {
      diagnostics.push(diagnostic(
        "BLOCK_PRESET_UNKNOWN",
        `${path}/presetRef`,
        `Unknown block preset '${binding.presetRef}'.`,
      ));
      return;
    }
    let admitted = true;
    const shape = blockShape(object.geometry);
    if (shape === undefined) {
      diagnostics.push(diagnostic(
        "BLOCK_MESH_GEOMETRY_INVALID",
        `${path}/geometry`,
        `Block '${binding.id}' must use one undeformed full, half, quarter, or small BoxGeometry.`,
      ));
      admitted = false;
    }
    if (!validMaterial(object, binding.presetRef)) {
      diagnostics.push(diagnostic(
        "BLOCK_MATERIAL_INVALID",
        `${path}/material`,
        `Block '${binding.id}' material no longer matches its frozen preset color and opacity.`,
      ));
      admitted = false;
    }
    const positionMetersXYZ = worldPositionMeters(object);
    if (positionMetersXYZ === undefined) {
      diagnostics.push(diagnostic(
        "BLOCK_MESH_POSITION_INVALID",
        `${path}/position`,
        `Block '${binding.id}' final position must align to the 0.25-meter center lattice.`,
      ));
      admitted = false;
    }
    if (!validWorldScale(object)) {
      diagnostics.push(diagnostic(
        "BLOCK_MESH_SCALE_INVALID",
        `${path}/scale`,
        `Block '${binding.id}' final world scale must equal [1,1,1].`,
      ));
      admitted = false;
    }
    const rotationQuarterTurnsY = worldQuarterTurnsY(object);
    if (rotationQuarterTurnsY === undefined) {
      diagnostics.push(diagnostic(
        "BLOCK_MESH_ROTATION_INVALID",
        `${path}/rotation`,
        `Block '${binding.id}' final rotation must be a Y-only quarter turn.`,
      ));
      admitted = false;
    }
    if (shape !== undefined && positionMetersXYZ !== undefined &&
        rotationQuarterTurnsY !== undefined && !blockPositionAlignsToLatticeV2({
          shape,
          positionMetersXYZ,
          rotationQuarterTurnsY,
        })) {
      diagnostics.push(diagnostic(
        "BLOCK_MESH_POSITION_INVALID",
        `${path}/position`,
        `Block '${binding.id}' faces must align to the 0.5-meter micro-grid.`,
      ));
      admitted = false;
    }
    if (!admitted || shape === undefined || positionMetersXYZ === undefined ||
        rotationQuarterTurnsY === undefined) return;
    blocks.push({
      id: binding.id,
      presetRef: binding.presetRef,
      shape,
      positionMetersXYZ,
      rotationQuarterTurnsY,
      ...(binding.visualGroupId === undefined ? {} : { visualGroupId: binding.visualGroupId }),
      ...(binding.interactionInstanceId === undefined
        ? {}
        : { interactionInstanceId: binding.interactionInstanceId }),
      ...(binding.initialStateId === undefined ? {} : { initialStateId: binding.initialStateId }),
    });
  });
  return Object.freeze({
    manifest: createBlockWorldManifestV2(blocks),
    diagnostics: freezeDiagnostics(diagnostics),
  });
}
