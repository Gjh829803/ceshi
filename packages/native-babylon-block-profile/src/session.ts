import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import type {
  BabylonNativeSceneBuildContextV1,
  BabylonNativeTraversalBindingV1,
} from "@whitebox-world/native-babylon";
import { isEqual, isNil } from "lodash-es";

import {
  createBabylonNativeBlockVisualsV1,
  validateBabylonNativeBlockDisplayGapV1,
} from "./babylon-visual-adapter.js";
import {
  createBabylonNativeBlockProfileCheckResultV1,
  type BabylonNativeBlockProfileCheckResultV1,
  type BabylonNativeBlockVisualGroupInventoryV1,
} from "./check.js";
import {
  materializeBabylonNativeBlockColliderCandidatesV1,
  type BabylonNativeBlockColliderCandidateInventoryEntryV1,
  type BabylonNativeBlockStaticColliderSelectionV1,
} from "./collider-contribution.js";
import {
  deriveBabylonNativeBlockLayoutV1,
  type BabylonNativeBlockLayoutV1,
} from "./layout.js";
import {
  BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1,
  BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
  type BabylonNativeBlockPaletteRoleV1,
} from "./profile.js";
import { settleBabylonNativeBlockProfileV1 } from "./profile-settlement.js";
import {
  BABYLON_NATIVE_BLOCK_ROTATION_QUARTER_TURNS_Y_V1,
  BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1,
  babylonNativeBlockCenterAlignsToGridV1,
  babylonNativeBlockOccupiedMicroCellKeysV1,
  canonicalizeBabylonNativeBlockEvidenceNumberV1,
  effectiveBabylonNativeBlockSizeMetersXYZV1,
  type BabylonNativeBlockPositionMetersXYZV1,
  type BabylonNativeBlockRotationQuarterTurnsYV1,
  type BabylonNativeBlockShapeKindV1,
} from "./shapes.js";
import {
  recordBabylonNativeBlockCheckedEpochEvidenceV1,
} from "./host-evidence.js";

export interface BabylonNativeBlockProfileBudgetV1 {
  readonly maximumBlockCount: number;
}

export interface BabylonNativeBlockCreateInputV1 {
  readonly id: string;
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly centerMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly rotationQuarterTurnsY?: BabylonNativeBlockRotationQuarterTurnsYV1;
  readonly visualGroupId?: string;
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
}

export interface BabylonNativeBlockProfileFinalizeInputV1 {
  readonly displayGapMeters?: number;
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

const STABLE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const SHAPES = new Set<BabylonNativeBlockShapeKindV1>([
  "full", "half", "quarter", "small", "step",
]);
const PALETTE_ROLES = new Set<BabylonNativeBlockPaletteRoleV1>(
  BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1,
);
const QUARTER_TURNS = new Set<number>(
  BABYLON_NATIVE_BLOCK_ROTATION_QUARTER_TURNS_Y_V1,
);
const DEFAULT_DISPLAY_GAP_METERS = 0.04;

function fail(code: string, message: string): never {
  throw new TypeError(`${code}: ${message}`);
}

function exactPlainRecord(
  input: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  code: string,
): Record<string, unknown> {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return fail(code, "value must be a plain object");
  }
  try {
    if (Reflect.getPrototypeOf(input) !== Object.prototype) {
      return fail(code, "value must use the ordinary object prototype");
    }
    const keys = Reflect.ownKeys(input);
    if (
      keys.some((key) => typeof key !== "string") ||
      requiredKeys.some((key) => !keys.includes(key)) ||
      keys.some((key) => typeof key !== "string" ||
        (!requiredKeys.includes(key) && !optionalKeys.includes(key)))
    ) return fail(code, "value must use the closed field set");
    const descriptors = Object.getOwnPropertyDescriptors(input);
    for (const key of keys) {
      const descriptor = descriptors[key as string]!;
      if (!descriptor.enumerable || !("value" in descriptor)) {
        return fail(code, "accessor or non-enumerable fields are not allowed");
      }
    }
    return Object.fromEntries(
      keys.map((key) => [key, descriptors[key as string]!.value]),
    );
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith(code)) throw error;
    return fail(code, "value cannot be inspected safely");
  }
}

function exactArray(input: unknown, code: string): readonly unknown[] {
  if (!Array.isArray(input) || Reflect.getPrototypeOf(input) !== Array.prototype) {
    return fail(code, "staticColliders must be one ordinary dense array");
  }
  try {
    if (
      Reflect.ownKeys(input).some((key) => typeof key === "symbol") ||
      Object.getOwnPropertyNames(input).length !== input.length + 1
    ) return fail(code, "staticColliders must be one ordinary dense array");
    const output: unknown[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
      if (isNil(descriptor) || !descriptor.enumerable || !("value" in descriptor)) {
        return fail(code, "staticColliders cannot contain holes or accessors");
      }
      output.push(descriptor.value);
    }
    return output;
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith(code)) throw error;
    return fail(code, "staticColliders cannot be inspected safely");
  }
}

function canonicalId(value: unknown): string | undefined {
  return typeof value === "string" && STABLE_ID.test(value) &&
      value.normalize("NFC") === value ? value : undefined;
}

function canonicalIdentity(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 &&
      value.trim() === value && value.normalize("NFC") === value
    ? value : undefined;
}

function parseBudget(
  input: Readonly<BabylonNativeBlockProfileBudgetV1>,
): BabylonNativeBlockProfileBudgetV1 {
  const code = "WORLDKIT_NATIVE_BLOCK_BUDGET_INVALID";
  const record = exactPlainRecord(input, ["maximumBlockCount"], [], code);
  if (typeof record.maximumBlockCount !== "number" ||
      !Number.isSafeInteger(record.maximumBlockCount) ||
      record.maximumBlockCount < 0 || Object.is(record.maximumBlockCount, -0)) {
    return fail(code, "maximumBlockCount must be a non-negative safe integer");
  }
  return Object.freeze({ maximumBlockCount: record.maximumBlockCount });
}

function parsePositionMetersXYZ(
  input: unknown,
  code: string,
): BabylonNativeBlockPositionMetersXYZV1 {
  if (!Array.isArray(input) ||
      Reflect.getPrototypeOf(input) !== Array.prototype ||
      input.length !== 3 ||
      Object.getOwnPropertyNames(input).length !== 4) {
    return fail(code, "positions must be one ordinary dense XYZ tuple");
  }
  const values: number[] = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, String(axis));
    if (isNil(descriptor) || !descriptor.enumerable || !("value" in descriptor) ||
        typeof descriptor.value !== "number" ||
        !Number.isFinite(descriptor.value)) {
      return fail(code, "positions must hold three finite plain numbers");
    }
    values.push(canonicalizeBabylonNativeBlockEvidenceNumberV1(descriptor.value));
  }
  return Object.freeze(values as [number, number, number]);
}

function parseQuarterTurns(
  record: Record<string, unknown>,
  code: string,
): BabylonNativeBlockRotationQuarterTurnsYV1 {
  if (!Object.hasOwn(record, "rotationQuarterTurnsY")) return 0;
  if (!QUARTER_TURNS.has(record.rotationQuarterTurnsY as number)) {
    return fail(code, "rotationQuarterTurnsY must be exactly 0, 1, 2, or 3");
  }
  return record.rotationQuarterTurnsY as BabylonNativeBlockRotationQuarterTurnsYV1;
}

function parseCreateInput(
  input: Readonly<BabylonNativeBlockCreateInputV1>,
): Readonly<BabylonNativeBlockCreateInputV1> {
  const code = "WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID";
  const record = exactPlainRecord(input,
    ["id", "shape", "paletteRole", "centerMetersXYZ"],
    ["rotationQuarterTurnsY", "visualGroupId"], code);
  const id = canonicalId(record.id);
  const hasVisualGroupId = Object.hasOwn(record, "visualGroupId");
  const visualGroupId = hasVisualGroupId
    ? canonicalId(record.visualGroupId) : undefined;
  if (isNil(id) ||
      !SHAPES.has(record.shape as BabylonNativeBlockShapeKindV1) ||
      !PALETTE_ROLES.has(record.paletteRole as BabylonNativeBlockPaletteRoleV1) ||
      (hasVisualGroupId && isNil(visualGroupId))) {
    return fail(code,
      "id, shape, paletteRole, or visualGroupId is outside the closed Profile");
  }
  const shape = record.shape as BabylonNativeBlockShapeKindV1;
  const centerMetersXYZ = parsePositionMetersXYZ(record.centerMetersXYZ, code);
  const rotationQuarterTurnsY = parseQuarterTurns(record, code);
  if (!babylonNativeBlockCenterAlignsToGridV1({
    shape,
    centerMetersXYZ,
    rotationQuarterTurnsY,
  })) {
    return fail(code,
      `center ${JSON.stringify(centerMetersXYZ)} is off the '${shape}' occupancy grid`);
  }
  return Object.freeze({
    id,
    shape,
    paletteRole: record.paletteRole as BabylonNativeBlockPaletteRoleV1,
    centerMetersXYZ,
    rotationQuarterTurnsY,
    ...(isNil(visualGroupId) ? {} : { visualGroupId }),
  });
}

function parseGridCreateInput(
  input: Readonly<BabylonNativeBlockGridCreateInputV1>,
  remainingBlockCount: number,
): readonly Readonly<BabylonNativeBlockCreateInputV1>[] {
  const code = "WORLDKIT_NATIVE_BLOCK_GRID_CREATE_INPUT_INVALID";
  const record = exactPlainRecord(input,
    ["idPrefix", "shape", "paletteRole", "minimumCenterMetersXYZ",
      "repeatCountXYZ"],
    ["rotationQuarterTurnsY", "visualGroupId"], code);
  const idPrefix = canonicalId(record.idPrefix);
  const hasVisualGroupId = Object.hasOwn(record, "visualGroupId");
  const visualGroupId = hasVisualGroupId
    ? canonicalId(record.visualGroupId) : undefined;
  if (isNil(idPrefix) ||
      !SHAPES.has(record.shape as BabylonNativeBlockShapeKindV1) ||
      !PALETTE_ROLES.has(record.paletteRole as BabylonNativeBlockPaletteRoleV1) ||
      (hasVisualGroupId && isNil(visualGroupId))) {
    return fail(code,
      "idPrefix, shape, paletteRole, or visualGroupId is outside the closed Profile");
  }
  const shape = record.shape as BabylonNativeBlockShapeKindV1;
  const paletteRole = record.paletteRole as BabylonNativeBlockPaletteRoleV1;
  const minimumCenterMetersXYZ = parsePositionMetersXYZ(
    record.minimumCenterMetersXYZ, code,
  );
  const rotationQuarterTurnsY = parseQuarterTurns(record, code);
  const repeatCountXYZ = parsePositionMetersXYZ(record.repeatCountXYZ, code);
  if (!repeatCountXYZ.every((count) =>
    Number.isSafeInteger(count) && count > 0)) {
    return fail(code, "repeatCountXYZ must hold three positive safe integers");
  }
  const totalCount = repeatCountXYZ[0] * repeatCountXYZ[1] * repeatCountXYZ[2];
  if (!Number.isSafeInteger(totalCount)) {
    return fail(code, "repeatCountXYZ product exceeds the safe integer range");
  }
  if (totalCount > remainingBlockCount) {
    return fail("WORLDKIT_NATIVE_BLOCK_COUNT_EXCEEDED",
      "block creation exceeds the caller-authorized hard cap");
  }
  const spacing = effectiveBabylonNativeBlockSizeMetersXYZV1(
    shape, rotationQuarterTurnsY,
  );
  const inputs: Readonly<BabylonNativeBlockCreateInputV1>[] = [];
  for (let yIndex = 0; yIndex < repeatCountXYZ[1]; yIndex += 1) {
    for (let zIndex = 0; zIndex < repeatCountXYZ[2]; zIndex += 1) {
      for (let xIndex = 0; xIndex < repeatCountXYZ[0]; xIndex += 1) {
        inputs.push(parseCreateInput(Object.freeze({
          id: `${idPrefix}-x${xIndex}-y${yIndex}-z${zIndex}`,
          shape,
          paletteRole,
          centerMetersXYZ: Object.freeze([
            minimumCenterMetersXYZ[0] + xIndex * spacing[0]!,
            minimumCenterMetersXYZ[1] + yIndex * spacing[1]!,
            minimumCenterMetersXYZ[2] + zIndex * spacing[2]!,
          ] as [number, number, number]),
          rotationQuarterTurnsY,
          ...(isNil(visualGroupId) ? {} : { visualGroupId }),
        })));
      }
    }
  }
  return Object.freeze(inputs);
}

function parseTraversalBinding(
  input: unknown,
  code: string,
): BabylonNativeTraversalBindingV1 {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return fail(code, "traversalBinding must use one closed branch");
  }
  let kind: unknown;
  try {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, "kind");
    if (isNil(descriptor) || !descriptor.enumerable || !("value" in descriptor)) {
      return fail(code, "traversalBinding.kind must be one data field");
    }
    kind = descriptor.value;
  } catch {
    return fail(code, "traversalBinding cannot be inspected safely");
  }
  if (kind === "not-traversable") {
    exactPlainRecord(input, ["kind"], [], code);
    return Object.freeze({ kind: "not-traversable" });
  }
  if (kind === "static-surface") {
    const record = exactPlainRecord(input, [
      "kind", "surfaceEntityId", "logicalSubshapeId",
      "traversalSurfaceProfileRef",
    ], [], code);
    const surfaceEntityId = canonicalIdentity(record.surfaceEntityId);
    const logicalSubshapeId = canonicalIdentity(record.logicalSubshapeId);
    const traversalSurfaceProfileRef = canonicalIdentity(
      record.traversalSurfaceProfileRef,
    );
    if (isNil(surfaceEntityId) || isNil(logicalSubshapeId) ||
        isNil(traversalSurfaceProfileRef)) {
      return fail(code, "static-surface identities must be canonical strings");
    }
    return Object.freeze({
      kind: "static-surface", surfaceEntityId, logicalSubshapeId,
      traversalSurfaceProfileRef,
    });
  }
  return fail(code, "traversalBinding.kind is outside the closed union");
}

function parseRatio(value: unknown, code: string, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) ||
      value < 0 || value > 1 || Object.is(value, -0)) {
    return fail(code, `${name} must be finite within 0..1`);
  }
  return value;
}

function parseSelection(input: unknown): BabylonNativeBlockStaticColliderSelectionV1 {
  const code = "WORLDKIT_NATIVE_BLOCK_COLLIDER_SELECTION_INVALID";
  const record = exactPlainRecord(input,
    ["id", "blockId", "traversalBinding"],
    ["frictionRatio", "restitutionRatio"], code);
  const id = canonicalId(record.id);
  const blockId = canonicalId(record.blockId);
  if (isNil(id) || isNil(blockId)) {
    return fail(code, "Collider and block IDs must be stable lowercase IDs");
  }
  return Object.freeze({
    id,
    blockId,
    traversalBinding: parseTraversalBinding(record.traversalBinding, code),
    ...(!Object.hasOwn(record, "frictionRatio") ? {} : {
      frictionRatio: parseRatio(record.frictionRatio, code, "frictionRatio"),
    }),
    ...(!Object.hasOwn(record, "restitutionRatio") ? {} : {
      restitutionRatio: parseRatio(
        record.restitutionRatio, code, "restitutionRatio",
      ),
    }),
  });
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseFinalizeInput(
  input: Readonly<BabylonNativeBlockProfileFinalizeInputV1>,
): Readonly<{
  displayGapMeters: number;
  staticColliders: readonly BabylonNativeBlockStaticColliderSelectionV1[];
}> {
  const code = "WORLDKIT_NATIVE_BLOCK_FINALIZE_INPUT_INVALID";
  const record = exactPlainRecord(input, ["staticColliders"],
    ["displayGapMeters"], code);
  const displayGapMeters = Object.hasOwn(record, "displayGapMeters")
    ? record.displayGapMeters
    : DEFAULT_DISPLAY_GAP_METERS;
  if (typeof displayGapMeters !== "number" ||
      !Number.isFinite(displayGapMeters) || displayGapMeters < 0) {
    return fail(code, "displayGapMeters must be finite and non-negative");
  }
  const staticColliders = exactArray(record.staticColliders, code)
    .map(parseSelection)
    .sort((left, right) => stableCompare(left.id, right.id));
  const colliderIds = new Set<string>();
  const blockIds = new Set<string>();
  for (const selection of staticColliders) {
    if (colliderIds.has(selection.id)) {
      return fail("WORLDKIT_NATIVE_BLOCK_COLLIDER_ID_DUPLICATE",
        `Collider id '${selection.id}' appears more than once`);
    }
    if (blockIds.has(selection.blockId)) {
      return fail("WORLDKIT_NATIVE_BLOCK_COLLIDER_BLOCK_DUPLICATE",
        `Block '${selection.blockId}' has more than one Collider selection`);
    }
    colliderIds.add(selection.id);
    blockIds.add(selection.blockId);
  }
  return Object.freeze({
    displayGapMeters: Object.is(displayGapMeters, -0) ? 0 : displayGapMeters,
    staticColliders: Object.freeze(staticColliders),
  });
}

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
  requestedBudget: Readonly<BabylonNativeBlockProfileBudgetV1>,
): BabylonNativeBlockProfileSessionV1 {
  const budget = parseBudget(requestedBudget);
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

  class AllocationFailure {
    constructor(
      readonly primaryError: unknown,
      readonly cleanupDidFail: boolean,
    ) {}
  }

  function reserve(
    parsedInputs: readonly Readonly<BabylonNativeBlockCreateInputV1>[],
  ): readonly (readonly string[])[] {
    if (recordsById.size + parsedInputs.length > budget.maximumBlockCount) {
      return fail("WORLDKIT_NATIVE_BLOCK_COUNT_EXCEEDED",
        "block creation exceeds the caller-authorized hard cap");
    }
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
    const mesh = MeshBuilder.CreateBox(parsedInput.id,
      { width: size[0], height: size[1], depth: size[2] }, context.scene);
    try {
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
      recordsById.set(parsedInput.id, Object.freeze({
        input: parsedInput,
        mesh,
        localGeometrySnapshot: Object.freeze({
          positions: Object.freeze(Array.from(positions)),
          indices: Object.freeze(Array.from(indices)),
        }),
      }));
    } catch (error) {
      let cleanupDidFail = false;
      try { mesh.dispose(); } catch { cleanupDidFail = true; }
      throw new AllocationFailure(error, cleanupDidFail);
    }
    for (const key of microCellKeys) {
      blockIdByMicroCellKey.set(key, parsedInput.id);
    }
    acquisitions.push(() => mesh.dispose());
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
        meshes.push(allocate(parsedInput, microCellKeysByInput[index]!));
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
      return createBatch(parseGridCreateInput(
        input,
        budget.maximumBlockCount - recordsById.size,
      ));
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
        validateBabylonNativeBlockDisplayGapV1(
          checkedLayout.layout,
          parsedInput.displayGapMeters,
          "WORLDKIT_NATIVE_BLOCK_FINALIZE_INPUT_INVALID",
        );
        const colliders = materializeBabylonNativeBlockColliderCandidatesV1({
          context,
          checkedLayout,
          selections: parsedInput.staticColliders,
        });
        acquisitions.push(() => colliders.dispose());
        const visuals = createBabylonNativeBlockVisualsV1({
          scene: context.scene,
          buildEpochId: context.bootstrap.id,
          checkedLayout,
          displayGapMeters: parsedInput.displayGapMeters,
        });
        acquisitions.push(() => visuals.dispose());
        const profileInventoryHash = settleBabylonNativeBlockProfileV1({
          context,
          checkedLayout,
          displayGapMeters: parsedInput.displayGapMeters,
          colliderInventory: colliders.inventory,
        });
        finalizedResult = Object.freeze({
          kind: "babylon-native-block-finalized-epoch",
          schemaVersion: 1,
          checkedLayout,
          visualGroups: checkedLayout.checkResult.visualGroups,
          colliderInventory: colliders.inventory,
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
          colliderInventory: colliders.inventory,
        });
        recordsById.clear();
        blockIdByMicroCellKey.clear();
        state = "finalized";
        return finalizedResult;
      } catch (error) {
        state = "failed";
        recordsById.clear();
        blockIdByMicroCellKey.clear();
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
      const cleanup = disposeAcquisitions(acquisitions);
      acquisitions.length = 0;
      if (cleanup.didFail) throw cleanup.error;
    },
  });
}
