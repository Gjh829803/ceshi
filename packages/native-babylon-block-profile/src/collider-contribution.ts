import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type {
  BabylonNativeSceneRegistrationV1,
  BabylonNativeTraversalBindingV1,
} from "@whitebox-world/native-babylon";

import type { BabylonNativeBlockProfileCheckResultV1 } from "./check.js";
import type { BabylonNativeBlockLayoutV1 } from "./layout.js";
import type { BabylonNativeBlockSessionRecordV1 } from "./session.js";

export interface BabylonNativeBlockStaticColliderSelectionV1 {
  readonly id: string;
  readonly blockId: string;
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
}

export interface BabylonNativeBlockColliderCandidateInventoryEntryV1 {
  readonly colliderId: string;
  readonly sourceBlockIds: readonly [string];
  readonly visualGroupIds: readonly string[];
  readonly proxyKind: "layout-block-volume";
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code: string, message: string): never {
  throw new TypeError(`${code}: ${message}`);
}

/**
 * Package-private Build-Epoch adapter. `selections` must already be canonical
 * frozen values from the future BNA-owned snapshot boundary; this layer never
 * reparses traversal bindings or derives core Contribution identity.
 */
export function createBabylonNativeBlockColliderCandidatesV1(
  input: Readonly<{
    scene: Scene;
    buildEpochId: string;
    layout: BabylonNativeBlockLayoutV1;
    checkResult: BabylonNativeBlockProfileCheckResultV1;
    records: readonly BabylonNativeBlockSessionRecordV1[];
    selections: readonly BabylonNativeBlockStaticColliderSelectionV1[];
    registration: BabylonNativeSceneRegistrationV1;
  }>,
): readonly BabylonNativeBlockColliderCandidateInventoryEntryV1[] {
  if (input.checkResult.outcome !== "passed") {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_COLLIDER_CHECK_REJECTED",
      "Collider candidates require one passed Block Profile check.",
    );
  }
  const layoutById = new Map(input.layout.blocks.map((block) => [block.id, block]));
  const recordsById = new Map(input.records.map((record) => [record.input.id, record]));
  const selections = [...input.selections]
    .sort((left, right) => stableCompare(left.id, right.id));
  const colliderIds = new Set<string>();
  const blockIds = new Set<string>();
  for (const selection of selections) {
    if (
      !Object.isFrozen(selection) ||
      !Object.isFrozen(selection.traversalBinding)
    ) {
      return fail(
        "WORLDKIT_NATIVE_BLOCK_COLLIDER_SELECTION_INVALID",
        "Selections must be canonical frozen values from the BNA-owned snapshot boundary.",
      );
    }
    if (colliderIds.has(selection.id)) {
      return fail(
        "WORLDKIT_NATIVE_BLOCK_COLLIDER_ID_DUPLICATE",
        `Collider id '${selection.id}' appears more than once.`,
      );
    }
    colliderIds.add(selection.id);
    if (blockIds.has(selection.blockId)) {
      return fail(
        "WORLDKIT_NATIVE_BLOCK_COLLIDER_BLOCK_DUPLICATE",
        `Block '${selection.blockId}' has more than one Collider selection.`,
      );
    }
    blockIds.add(selection.blockId);
    if (
      !layoutById.has(selection.blockId) ||
      !recordsById.has(selection.blockId)
    ) {
      return fail(
        "WORLDKIT_NATIVE_BLOCK_COLLIDER_BLOCK_MISSING",
        `Block '${selection.blockId}' is absent from this checked Build Epoch.`,
      );
    }
    if (recordsById.get(selection.blockId)!.mesh.getScene() !== input.scene) {
      return fail(
        "WORLDKIT_NATIVE_BLOCK_SCENE_MISMATCH",
        `Block '${selection.blockId}' belongs to another Candidate Scene.`,
      );
    }
  }
  const inventory = selections
    .map((selection) => {
      const block = layoutById.get(selection.blockId)!;
      const record = recordsById.get(selection.blockId)!;
      const proxy = MeshBuilder.CreateBox(
        `worldkit-block-collider-${input.buildEpochId}-${selection.id}`,
        {
          width: block.sizeMetersXYZ[0],
          height: block.sizeMetersXYZ[1],
          depth: block.sizeMetersXYZ[2],
        },
        input.scene,
      );
      proxy.position.set(
        block.centerMetersXYZ[0],
        block.centerMetersXYZ[1],
        block.centerMetersXYZ[2],
      );
      proxy.isVisible = false;
      proxy.isPickable = false;
      proxy.computeWorldMatrix(true);
      input.registration.registerStaticCollider(Object.freeze({
        id: selection.id,
        mesh: proxy,
        traversalBinding: selection.traversalBinding,
        ...(selection.frictionRatio === undefined
          ? {}
          : { frictionRatio: selection.frictionRatio }),
        ...(selection.restitutionRatio === undefined
          ? {}
          : { restitutionRatio: selection.restitutionRatio }),
      }));
      return Object.freeze({
        colliderId: selection.id,
        sourceBlockIds: Object.freeze([selection.blockId] as [string]),
        visualGroupIds: Object.freeze(
          record.input.visualGroupId === undefined
            ? []
            : [record.input.visualGroupId],
        ),
        proxyKind: "layout-block-volume" as const,
        traversalBinding: selection.traversalBinding,
      });
    });
  layoutById.clear();
  recordsById.clear();
  return Object.freeze(inventory);
}
