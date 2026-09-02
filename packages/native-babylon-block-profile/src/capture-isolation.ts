import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import { isNil } from "lodash-es";

import {
  failBabylonNativeBlockProfileBuildV1 as fail,
} from "./build-failure.js";
import {
  babylonNativeBlockLiveVisualHandleMeshV1,
  type BabylonNativeBlockLiveHandleRegistryV1,
} from "./live-handle-registry.js";
import { suspendBabylonNativeBlockWalkableDisplayV1 } from
  "./whitebox-display.js";

const CODE = "WORLDKIT_NATIVE_BLOCK_CAPTURE_ISOLATION_INVALID";
const THIN_INSTANCE_MATRIX_STRIDE = 16;
const LINEAR_MATRIX_OFFSETS = Object.freeze([0, 1, 2, 4, 5, 6, 8, 9, 10]);

export interface BabylonNativeBlockCaptureIsolationV1 {
  readonly targetBlockIds: readonly string[];
  readonly hiddenIndependentBlockIds: readonly string[];
  readonly hiddenBatchIds: readonly string[];
  readonly maskedThinInstanceCount: number;
  readonly tintedMeshCount: number;
  readonly hiddenWalkableOverlayColliderIds: readonly string[];
  restore(): void;
}

export interface ApplyBabylonNativeBlockCaptureIsolationInputV1 {
  readonly registry: BabylonNativeBlockLiveHandleRegistryV1;
  readonly targetBlockIds: readonly string[];
  readonly tint?: Readonly<{
    readonly materialName: string;
    readonly colorHex: `#${string}`;
  }>;
}

type RestoreStepV1 = () => void;

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Isolate exactly the requested logical Blocks for one formal Capture view.
 * Independent Meshes hide directly; batched Blocks keep their batch resident
 * and mask only the non-target Thin Instances, so a batch never loses or gains
 * Capture identity. Every mutation is reversed by `restore()` exactly once.
 */
export function applyBabylonNativeBlockCaptureIsolationV1(
  input: ApplyBabylonNativeBlockCaptureIsolationInputV1,
): BabylonNativeBlockCaptureIsolationV1 {
  const { registry } = input;
  if (
    registry.kind !== "babylon-native-block-live-handle-registry" ||
    registry.schemaVersion !== 1 ||
    !Array.isArray(input.targetBlockIds) ||
    input.targetBlockIds.length === 0
  ) {
    return fail(CODE, "Capture isolation requires one live registry and at least one target Block.");
  }
  const targetBlockIds = [...input.targetBlockIds].sort(stableCompare);
  const targets = new Set(targetBlockIds);
  if (targets.size !== targetBlockIds.length) {
    return fail(CODE, "Capture isolation target Block IDs must be unique.");
  }
  const handleByBlockId = new Map(registry.blocks.map((handle) =>
    [handle.blockId, handle] as const));
  for (const blockId of targetBlockIds) {
    const handle = handleByBlockId.get(blockId);
    if (
      isNil(handle) ||
      babylonNativeBlockLiveVisualHandleMeshV1(handle).isDisposed()
    ) {
      return fail(
        CODE,
        `Capture isolation target '${blockId}' has no live registry handle.`,
      );
    }
  }

  const restoreSteps: RestoreStepV1[] = [];
  const hiddenIndependentBlockIds: string[] = [];
  const hiddenBatchIds: string[] = [];
  const hiddenWalkableOverlayColliderIds: string[] = [];
  let maskedThinInstanceCount = 0;
  let tintedMeshCount = 0;
  let tintMaterial: StandardMaterial | undefined;

  const hide = (mesh: Mesh): void => {
    const priorIsVisible = mesh.isVisible;
    restoreSteps.push(() => {
      mesh.isVisible = priorIsVisible;
    });
    mesh.isVisible = false;
  };
  const applyTint = (mesh: Mesh): void => {
    if (isNil(input.tint)) return;
    if (isNil(tintMaterial)) {
      tintMaterial = new StandardMaterial(
        input.tint.materialName,
        mesh.getScene(),
      );
      tintMaterial.diffuseColor = Color3.FromHexString(input.tint.colorHex);
      tintMaterial.emissiveColor = Color3.FromHexString(input.tint.colorHex);
      tintMaterial.specularColor = new Color3(0, 0, 0);
      tintMaterial.disableLighting = true;
      const owned = tintMaterial;
      restoreSteps.push(() => {
        owned.dispose();
      });
    }
    const walkableDisplay = suspendBabylonNativeBlockWalkableDisplayV1(mesh);
    if (!isNil(walkableDisplay)) {
      restoreSteps.push(() => walkableDisplay.restore());
    }
    const priorMaterial: Material | null = mesh.material;
    restoreSteps.push(() => {
      mesh.material = priorMaterial;
    });
    mesh.material = tintMaterial;
    tintedMeshCount += 1;
  };

  try {
    for (const handle of registry.blocks) {
      if (handle.kind !== "independent-mesh") continue;
      if (!targets.has(handle.blockId)) {
        hide(handle.mesh);
        hiddenIndependentBlockIds.push(handle.blockId);
        continue;
      }
      applyTint(handle.mesh);
    }
    for (const batch of registry.visualBatches) {
      const maskedIndexes = batch.blockIds
        .map((blockId, instanceIndex) =>
          targets.has(blockId) ? -1 : instanceIndex)
        .filter((instanceIndex) => instanceIndex !== -1);
      if (maskedIndexes.length === batch.blockIds.length) {
        hide(batch.mesh);
        hiddenBatchIds.push(batch.batchId);
        continue;
      }
      if (maskedIndexes.length > 0) {
        const current = batch.mesh.thinInstanceGetWorldMatrices();
        if (current.length !== batch.blockIds.length) {
          return fail(
            CODE,
            `Batch '${batch.batchId}' Thin Instance count does not match its Block rows.`,
          );
        }
        const priorMatrices = new Float32Array(
          batch.blockIds.length * THIN_INSTANCE_MATRIX_STRIDE,
        );
        current.forEach((matrix, instanceIndex) =>
          matrix.copyToArray(
            priorMatrices,
            instanceIndex * THIN_INSTANCE_MATRIX_STRIDE,
          ));
        const maskedMatrices = new Float32Array(priorMatrices);
        for (const instanceIndex of maskedIndexes) {
          for (const offset of LINEAR_MATRIX_OFFSETS) {
            maskedMatrices[
              instanceIndex * THIN_INSTANCE_MATRIX_STRIDE + offset
            ] = 0;
          }
        }
        const mesh = batch.mesh;
        restoreSteps.push(() => {
          mesh.thinInstanceSetBuffer(
            "matrix",
            new Float32Array(priorMatrices),
            THIN_INSTANCE_MATRIX_STRIDE,
            true,
          );
          mesh.thinInstanceRefreshBoundingInfo(true);
        });
        mesh.thinInstanceSetBuffer(
          "matrix",
          maskedMatrices,
          THIN_INSTANCE_MATRIX_STRIDE,
          true,
        );
        mesh.thinInstanceRefreshBoundingInfo(true);
        maskedThinInstanceCount += maskedIndexes.length;
      }
      applyTint(batch.mesh);
    }
    for (const overlay of registry.walkableOverlays) {
      hide(overlay.mesh);
      hiddenWalkableOverlayColliderIds.push(overlay.logicalColliderId);
    }
  } catch (error) {
    runRestoreSteps(restoreSteps);
    throw error;
  }

  let isRestored = false;
  return Object.freeze({
    targetBlockIds: Object.freeze(targetBlockIds),
    hiddenIndependentBlockIds: Object.freeze(
      [...hiddenIndependentBlockIds].sort(stableCompare),
    ),
    hiddenBatchIds: Object.freeze([...hiddenBatchIds].sort(stableCompare)),
    maskedThinInstanceCount,
    tintedMeshCount,
    hiddenWalkableOverlayColliderIds: Object.freeze(
      [...hiddenWalkableOverlayColliderIds].sort(stableCompare),
    ),
    restore(): void {
      if (isRestored) return;
      isRestored = true;
      const cleanup = runRestoreSteps(restoreSteps);
      if (cleanup.didFail) throw cleanup.error;
    },
  });
}

function runRestoreSteps(
  steps: readonly RestoreStepV1[],
): Readonly<{ didFail: boolean; error: unknown }> {
  let didFail = false;
  let firstFailure: unknown;
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    try {
      steps[index]!();
    } catch (error) {
      if (didFail) continue;
      didFail = true;
      firstFailure = error;
    }
  }
  return Object.freeze({ didFail, error: firstFailure });
}
