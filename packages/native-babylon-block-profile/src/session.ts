import { createBabylonNativeBlockInputParsersV1 } from "./session-input.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Geometry } from "@babylonjs/core/Meshes/geometry.js";
import { Scene } from "@babylonjs/core/scene.js";
import type {
  BabylonNativeSceneBuildContextV1,
} from "@whitebox-world/native-babylon";
import { hashBabylonNativeSceneBootstrapV1 } from
  "@whitebox-world/runtime-contracts";
import { isEqual, isNil } from "lodash-es";

import {
  createBabylonNativeBlockVisualsV1,
} from "./babylon-visual-adapter.js";
import {
  failBabylonNativeBlockProfileBuildV1 as fail,
} from "./build-failure.js";
import {
  createBabylonNativeBlockProfileCheckResultV1,
  type BabylonNativeBlockProfileCheckResultV1,
  type BabylonNativeBlockVisualGroupInventoryV1,
} from "./check.js";
import {
  type BabylonNativeBlockColliderCandidateInventoryEntryV1,
  type BabylonNativeBlockStaticColliderSelectionV1,
} from "./collider-contribution.js";
import {
  buildBabylonNativeBlockGroundBoundaryV1,
  createBabylonNativeBlockGroundBoundaryContributionV1,
} from "./ground-boundary.js";
import {
  deriveBabylonNativeBlockLayoutV1,
  type BabylonNativeBlockLayoutV1,
} from "./layout.js";
import {
  BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
  type BabylonNativeBlockPaletteRoleV1,
} from "./profile.js";
import {
  createBabylonNativeBlockProfileInventoryIdentityFromSelectionsV1,
} from "./profile-inventory.js";
import { settleBabylonNativeBlockProfileV1 } from "./profile-settlement.js";
import { freezeBabylonNativeBlockLogicalGroundModelV1 } from
  "./logical-ground-model.js";
import {
  BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1,
  buildBabylonNativeBlockWalkableTopologyV1,
} from
  "./walkable-topology.js";
import { materializeBabylonNativeBlockWalkableTopologyV1 } from
  "./walkable-topology-materializer.js";
import {
  BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1,
  babylonNativeBlockOccupiedMicroCellKeysV1,
  type BabylonNativeBlockPositionMetersXYZV1,
  type BabylonNativeBlockRotationQuarterTurnsYV1,
  type BabylonNativeBlockShapeKindV1,
} from "./shapes.js";
import {
  recordBabylonNativeBlockCheckedEpochEvidenceV1,
} from "./host-evidence.js";

export interface BabylonNativeBlockCreateInputV1 {
  readonly id: string;
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly centerMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly rotationQuarterTurnsY?: BabylonNativeBlockRotationQuarterTurnsYV1;
  readonly visualGroupId?: string;
  readonly colliderGroupId?: string;
}

export interface BabylonNativeBlockGridCreateInputV1 {
  readonly idPrefix: string;
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly minimumCenterMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly repeatCountXYZ: readonly [
    xCount: number,
    yCount: number,
    zCount: number,
  ];
  readonly rotationQuarterTurnsY?: BabylonNativeBlockRotationQuarterTurnsYV1;
  readonly visualGroupId?: string;
  readonly colliderGroupId?: string;
}

export interface BabylonNativeBlockProfileFinalizeInputV1 {
  readonly staticColliders:
    readonly BabylonNativeBlockStaticColliderSelectionV1[];
}

export interface BabylonNativeBlockProfileSessionV1 {
  createBlock(input: Readonly<BabylonNativeBlockCreateInputV1>): Mesh;
  createBlockGrid(
    input: Readonly<BabylonNativeBlockGridCreateInputV1>,
  ): readonly Mesh[];
  finalize(
    input: Readonly<BabylonNativeBlockProfileFinalizeInputV1>,
  ): BabylonNativeBlockFinalizedEpochV1;
  dispose(): void;
}

export interface BabylonNativeBlockSessionRecordV1 {
  readonly input: Readonly<BabylonNativeBlockCreateInputV1>;
  readonly mesh: Mesh;
  readonly localGeometrySnapshot: Readonly<{
    readonly positions: readonly number[];
    readonly indices: readonly number[];
  }>;
}

export interface BabylonNativeBlockCheckedLayoutV1 {
  readonly kind: "babylon-native-block-checked-layout";
  readonly schemaVersion: 1;
  readonly layout: BabylonNativeBlockLayoutV1;
  readonly checkResult: BabylonNativeBlockProfileCheckResultV1;
  readonly records: readonly BabylonNativeBlockSessionRecordV1[];
}

export interface BabylonNativeBlockFinalizedEpochV1 {
  readonly kind: "babylon-native-block-finalized-epoch";
  readonly schemaVersion: 1;
  readonly checkedLayout: BabylonNativeBlockCheckedLayoutV1;
  readonly visualGroups:
    readonly BabylonNativeBlockVisualGroupInventoryV1[];
  readonly colliderInventory:
    readonly BabylonNativeBlockColliderCandidateInventoryEntryV1[];
  readonly profileInventoryHash: `sha256:${string}`;
}

const GROUND_BOUNDARY_POLICY = Object.freeze({
  kind: "babylon-native-block-ground-boundary-policy" as const,
  schemaVersion: 1 as const,
  heightAboveSurfaceMeters: 4,
  depthBelowSurfaceMeters: 0.2,
  maximumSourceSegmentCount: 262_144,
  maximumMergedSegmentCount: 131_072,
  maximumBoundaryVertexCount: 524_288,
  maximumBoundaryTriangleCount: 262_144,
});

const { parseCreateInput, parseGridCreateInput, parseFinalizeInput } =
  createBabylonNativeBlockInputParsersV1(fail);

function disposeAcquisitions(
  acquisitions: readonly (() => void)[],
): Readonly<{ didFail: boolean; error: unknown }> {
  let didFail = false;
  let firstFailure: unknown;
  for (let index = acquisitions.length - 1; index >= 0; index -= 1) {
    try {
      acquisitions[index]!();
    } catch (error) {
      if (!didFail) {
        didFail = true;
        firstFailure = error;
      }
    }
  }
  return Object.freeze({ didFail, error: firstFailure });
}

export function createBabylonNativeBlockProfileSessionV1(
  context: BabylonNativeSceneBuildContextV1,
): BabylonNativeBlockProfileSessionV1 {
  if (!(context.scene instanceof Scene) || context.scene.isDisposed) {
    return fail("WORLDKIT_NATIVE_BLOCK_SCENE_INVALID",
      "the Profile requires one live Host Candidate Scene");
  }
  if (context.bootstrap.nativeSceneProfileRef !==
      BABYLON_NATIVE_BLOCK_PROFILE_REF_V1) {
    return fail("WORLDKIT_NATIVE_BLOCK_PROFILE_MISMATCH",
      "bootstrap.nativeSceneProfileRef does not select whitebox.blocks@1");
  }

  let state: "open" | "finalizing" | "finalized" | "failed" | "disposed" =
    "open";
  let finalizedResult: BabylonNativeBlockFinalizedEpochV1 | undefined;
  let finalizedInput: ReturnType<typeof parseFinalizeInput> | undefined;
  const recordsById = new Map<string, BabylonNativeBlockSessionRecordV1>();
  const blockIdByMicroCellKey = new Map<string, string>();
  const acquisitions: (() => void)[] = [];
  // Raw authoring Meshes have fixed geometry. Display batches are separately
  // materialized and must not reuse these buffers (thin-instance data is per Geometry).
  const rawGeometryByShape = new Map<BabylonNativeBlockShapeKindV1, Readonly<{
    geometry: Geometry;
    snapshot: BabylonNativeBlockSessionRecordV1["localGeometrySnapshot"];
  }>>();

  class AllocationFailure {
    constructor(
      readonly primaryError: unknown,
      readonly cleanupDidFail: boolean,
    ) {}
  }

  function reserve(
    parsedInputs: readonly Readonly<BabylonNativeBlockCreateInputV1>[],
  ): readonly (readonly string[])[] {
    const proposedIds = new Set<string>();
    const proposedCells = new Map<string, string>();
    const microCellKeysByInput: (readonly string[])[] = [];
    for (const parsedInput of parsedInputs) {
      if (recordsById.has(parsedInput.id) || proposedIds.has(parsedInput.id)) {
        return fail("WORLDKIT_NATIVE_BLOCK_ID_DUPLICATE",
          `block id '${parsedInput.id}' is already used in this session`);
      }
      proposedIds.add(parsedInput.id);
      const microCellKeys = babylonNativeBlockOccupiedMicroCellKeysV1({
        shape: parsedInput.shape,
        centerMetersXYZ: parsedInput.centerMetersXYZ,
        rotationQuarterTurnsY: parsedInput.rotationQuarterTurnsY ?? 0,
      });
      for (const key of microCellKeys) {
        const occupantId = blockIdByMicroCellKey.get(key) ??
          proposedCells.get(key);
        if (!isNil(occupantId)) {
          return fail("WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP",
            `block '${parsedInput.id}' overlaps '${occupantId}' at cell ${key}`);
        }
        proposedCells.set(key, parsedInput.id);
      }
      microCellKeysByInput.push(microCellKeys);
    }
    return Object.freeze(microCellKeysByInput);
  }

  function allocate(
    parsedInput: Readonly<BabylonNativeBlockCreateInputV1>,
    microCellKeys: readonly string[],
  ): Mesh {
    const size = BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1[
      parsedInput.shape
    ];
    const sceneMeshesBefore = new Set(context.scene.meshes);
    let mesh: Mesh | undefined;
    try {
      let pooled = rawGeometryByShape.get(parsedInput.shape);
      // A fully rolled-back grid may have released the last Geometry reference.
      if (!isNil(pooled) && pooled.geometry.isDisposed()) {
        rawGeometryByShape.delete(parsedInput.shape);
        pooled = undefined;
      }
      if (isNil(pooled)) {
        mesh = MeshBuilder.CreateBox(parsedInput.id,
          { width: size[0], height: size[1], depth: size[2] }, context.scene);
      } else {
        mesh = new Mesh(parsedInput.id, context.scene);
        pooled.geometry.applyToMesh(mesh);
      }
      mesh.position.set(
        parsedInput.centerMetersXYZ[0],
        parsedInput.centerMetersXYZ[1],
        parsedInput.centerMetersXYZ[2],
      );
      mesh.rotation.y = (parsedInput.rotationQuarterTurnsY ?? 0) * Math.PI / 2;
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
      const indices = mesh.getIndices();
      if (isNil(positions) || isNil(indices)) {
        return fail("WORLDKIT_NATIVE_BLOCK_MESH_GEOMETRY_INVALID",
          "the fixed block helper did not produce indexed position geometry");
      }
      if (isNil(pooled)) {
        pooled = Object.freeze({
          geometry: mesh.geometry!,
          snapshot: Object.freeze({
            positions: Object.freeze(Array.from(positions)),
            indices: Object.freeze(Array.from(indices)),
          }),
        });
        rawGeometryByShape.set(parsedInput.shape, pooled);
      }
      recordsById.set(parsedInput.id, Object.freeze({
        input: parsedInput,
        mesh,
        // Never re-baseline a shared buffer after user code has mutated it.
        localGeometrySnapshot: pooled.snapshot,
      }));
    } catch (error) {
      let cleanupDidFail = false;
      const uncommittedMeshes = context.scene.meshes.filter(
        (candidate) => !sceneMeshesBefore.has(candidate),
      );
      if (!isNil(mesh) && !uncommittedMeshes.includes(mesh)) {
        uncommittedMeshes.push(mesh);
      }
      for (let index = uncommittedMeshes.length - 1; index >= 0; index -= 1) {
        const candidate = uncommittedMeshes[index]!;
        try {
          candidate.dispose();
        } catch {
          cleanupDidFail = true;
          try { context.scene.removeMesh(candidate); } catch { /* failed */ }
        }
      }
      throw new AllocationFailure(error, cleanupDidFail);
    }
    for (const key of microCellKeys) {
      blockIdByMicroCellKey.set(key, parsedInput.id);
    }
    return mesh;
  }

  function release(
    parsedInputs: readonly Readonly<BabylonNativeBlockCreateInputV1>[],
    microCellKeysByInput: readonly (readonly string[])[],
    committedCount: number,
  ): boolean {
    let cleanupDidFail = false;
    for (let index = committedCount - 1; index >= 0; index -= 1) {
      const parsedInput = parsedInputs[index]!;
      recordsById.delete(parsedInput.id);
      for (const key of microCellKeysByInput[index]!) {
        blockIdByMicroCellKey.delete(key);
      }
      const dispose = acquisitions.pop();
      if (!isNil(dispose)) {
        try { dispose(); } catch { cleanupDidFail = true; }
      }
    }
    return cleanupDidFail;
  }

  function createBatch(
    parsedInputs: readonly Readonly<BabylonNativeBlockCreateInputV1>[],
  ): readonly Mesh[] {
    const microCellKeysByInput = reserve(parsedInputs);
    const meshes: Mesh[] = [];
    try {
      for (const [index, parsedInput] of parsedInputs.entries()) {
        const mesh = allocate(parsedInput, microCellKeysByInput[index]!);
        // Capture only this iteration's Mesh, outside allocate's lexical
        // environment: retaining its sceneMeshesBefore Set costs O(n²) space.
        acquisitions.push(() => mesh.dispose());
        meshes.push(mesh);
      }
    } catch (error) {
      const primaryError = error instanceof AllocationFailure
        ? error.primaryError
        : error;
      const batchCleanupDidFail = release(
        parsedInputs,
        microCellKeysByInput,
        meshes.length,
      );
      const cleanupDidFail = (error instanceof AllocationFailure &&
        error.cleanupDidFail) || batchCleanupDidFail;
      if (cleanupDidFail) state = "failed";
      throw primaryError;
    }
    return Object.freeze(meshes);
  }

  return Object.freeze({
    createBlock(input: Readonly<BabylonNativeBlockCreateInputV1>): Mesh {
      if (state !== "open") {
        return fail("WORLDKIT_NATIVE_BLOCK_SESSION_CLOSED",
          "createBlock is unavailable after finalization begins");
      }
      return createBatch([parseCreateInput(input)])[0]!;
    },
    createBlockGrid(
      input: Readonly<BabylonNativeBlockGridCreateInputV1>,
    ): readonly Mesh[] {
      if (state !== "open") {
        return fail("WORLDKIT_NATIVE_BLOCK_SESSION_CLOSED",
          "createBlockGrid is unavailable after finalization begins");
      }
      return createBatch(parseGridCreateInput(input));
    },
    finalize(
      input: Readonly<BabylonNativeBlockProfileFinalizeInputV1>,
    ): BabylonNativeBlockFinalizedEpochV1 {
      if (state !== "open" && state !== "finalized") {
        return fail("WORLDKIT_NATIVE_BLOCK_SESSION_CLOSED",
          "finalize is unavailable after failure or disposal");
      }
      const parsedInput = parseFinalizeInput(input);
      if (state === "finalized") {
        if (isEqual(parsedInput, finalizedInput)) return finalizedResult!;
        return fail("WORLDKIT_NATIVE_BLOCK_FINALIZE_INPUT_MISMATCH",
          "repeated finalize must use the exact same canonical input");
      }
      state = "finalizing";
      finalizedInput = parsedInput;
      try {
        const records = Object.freeze([...recordsById.values()]);
        const layout = deriveBabylonNativeBlockLayoutV1(context.scene, records);
        const checkedLayout = Object.freeze({
          kind: "babylon-native-block-checked-layout" as const,
          schemaVersion: 1 as const,
          layout,
          checkResult: createBabylonNativeBlockProfileCheckResultV1(
            context.bootstrap.id, records, layout,
          ),
          records,
        });
        if (checkedLayout.checkResult.outcome !== "passed") {
          return fail("WORLDKIT_NATIVE_BLOCK_PROFILE_CHECK_REJECTED",
            checkedLayout.checkResult.diagnostics.map(({ code }) => code)
              .join(", ") || "the checked Layout was rejected");
        }
        const profileInventory =
          createBabylonNativeBlockProfileInventoryIdentityFromSelectionsV1({
            checkedLayout,
            selections: parsedInput.staticColliders,
          });
        const logicalGroundModel =
          freezeBabylonNativeBlockLogicalGroundModelV1({
            buildEpochId: context.bootstrap.id,
            checkedLayout,
            profileInventoryHash: profileInventory.profileInventoryHash,
            nativeSceneBootstrapHash:
              hashBabylonNativeSceneBootstrapV1(context.bootstrap),
            selections: parsedInput.staticColliders,
          });
        const topology = buildBabylonNativeBlockWalkableTopologyV1({
          groundModel: logicalGroundModel,
          policy: BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1,
        });
        const visuals = createBabylonNativeBlockVisualsV1({
          scene: context.scene,
          buildEpochId: context.bootstrap.id,
          checkedLayout,
        });
        acquisitions.push(() => visuals.dispose());
        const colliders = materializeBabylonNativeBlockWalkableTopologyV1({
          context,
          topology,
          liveHandles: visuals.liveHandles,
        });
        acquisitions.push(() => colliders.dispose());
        const groundBoundary = buildBabylonNativeBlockGroundBoundaryV1({
          topology,
          policy: GROUND_BOUNDARY_POLICY,
        });
        const groundBoundaryContribution = groundBoundary.triangleCount === 0
          ? undefined
          : createBabylonNativeBlockGroundBoundaryContributionV1(
              groundBoundary,
            );
        const profileInventoryHash = settleBabylonNativeBlockProfileV1({
          context,
          checkedLayout,
          colliderInventory: colliders.colliderInventory,
          walkableOverlays: colliders.walkableOverlays,
          expectedProfileInventoryHash: profileInventory.profileInventoryHash,
        });
        finalizedResult = Object.freeze({
          kind: "babylon-native-block-finalized-epoch",
          schemaVersion: 1,
          checkedLayout,
          visualGroups: checkedLayout.checkResult.visualGroups,
          colliderInventory: colliders.colliderInventory,
          profileInventoryHash,
        });
        recordBabylonNativeBlockCheckedEpochEvidenceV1(context.scene, {
          kind: "babylon-native-block-checked-epoch-evidence",
          schemaVersion: 1,
          checkedLayout: {
            kind: checkedLayout.kind,
            schemaVersion: checkedLayout.schemaVersion,
            layout: checkedLayout.layout,
            checkResult: checkedLayout.checkResult,
          },
          profileInventoryHash,
          colliderInventory: colliders.colliderInventory,
          logicalGroundModel,
          topology,
          groundBoundary,
          ...(isNil(groundBoundaryContribution)
            ? {}
            : { groundBoundaryContribution }),
        });
        recordsById.clear();
        blockIdByMicroCellKey.clear();
        rawGeometryByShape.clear();
        state = "finalized";
        return finalizedResult;
      } catch (error) {
        state = "failed";
        recordsById.clear();
        blockIdByMicroCellKey.clear();
        rawGeometryByShape.clear();
        disposeAcquisitions(acquisitions);
        acquisitions.length = 0;
        throw error;
      }
    },
    dispose(): void {
      if (state === "disposed") return;
      state = "disposed";
      recordsById.clear();
      blockIdByMicroCellKey.clear();
      rawGeometryByShape.clear();
      const cleanup = disposeAcquisitions(acquisitions);
      acquisitions.length = 0;
      if (cleanup.didFail) throw cleanup.error;
    },
  });
}
