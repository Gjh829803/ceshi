import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { BabylonNativeSceneBuildContextV1 } from "@whitebox-world/native-babylon";

import {
  createBabylonNativeBlockProfileCheckResultV1,
  type BabylonNativeBlockProfileCheckResultV1,
} from "./check.js";
import { deriveBabylonNativeBlockLayoutV1 } from "./layout.js";
import {
  BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1,
  BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
  type BabylonNativeBlockPaletteRoleV1,
} from "./profile.js";
import {
  BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1,
  type BabylonNativeBlockShapeKindV1,
} from "./shapes.js";

export interface BabylonNativeBlockProfileBudgetV1 {
  readonly maximumBlockCount: number;
}

export interface BabylonNativeBlockDefinitionV1 {
  readonly id: string;
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly visualGroupId?: string;
}

export interface BabylonNativeBlockProfileSessionV1 {
  createBlock(definition: Readonly<BabylonNativeBlockDefinitionV1>): Mesh;
  finalize(): BabylonNativeBlockProfileCheckResultV1;
}

export interface BabylonNativeBlockSessionRecordV1 {
  readonly definition: Readonly<BabylonNativeBlockDefinitionV1>;
  readonly mesh: Mesh;
}

const STABLE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const SHAPES = new Set<BabylonNativeBlockShapeKindV1>([
  "full",
  "half",
  "quarter",
  "small",
]);
const PALETTE_ROLES = new Set<BabylonNativeBlockPaletteRoleV1>(
  BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1,
);

function fail(code: string, message: string): never {
  throw new TypeError(`${code}: ${message}`);
}

function exactPlainRecord(
  input: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  code: string,
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
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
      keys.some((key) =>
        typeof key !== "string" ||
        (!requiredKeys.includes(key) && !optionalKeys.includes(key)),
      )
    ) {
      return fail(code, "value must use the closed field set");
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    for (const key of keys) {
      if (!("value" in descriptors[key as string]!)) {
        return fail(code, "accessor fields are not allowed");
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

function canonicalId(value: unknown): string | undefined {
  return typeof value === "string" &&
    STABLE_ID.test(value) &&
    value.normalize("NFC") === value
    ? value
    : undefined;
}

function parseBudget(
  input: Readonly<BabylonNativeBlockProfileBudgetV1>,
): BabylonNativeBlockProfileBudgetV1 {
  const code = "WORLDKIT_NATIVE_BLOCK_BUDGET_INVALID";
  const record = exactPlainRecord(input, ["maximumBlockCount"], [], code);
  if (
    typeof record.maximumBlockCount !== "number" ||
    !Number.isSafeInteger(record.maximumBlockCount) ||
    record.maximumBlockCount < 0 ||
    Object.is(record.maximumBlockCount, -0)
  ) {
    return fail(code, "maximumBlockCount must be a non-negative safe integer");
  }
  return Object.freeze({ maximumBlockCount: record.maximumBlockCount });
}

function parseDefinition(
  input: Readonly<BabylonNativeBlockDefinitionV1>,
): Readonly<BabylonNativeBlockDefinitionV1> {
  const code = "WORLDKIT_NATIVE_BLOCK_DEFINITION_INVALID";
  const record = exactPlainRecord(
    input,
    ["id", "shape", "paletteRole"],
    ["visualGroupId"],
    code,
  );
  const id = canonicalId(record.id);
  const visualGroupId = record.visualGroupId === undefined
    ? undefined
    : canonicalId(record.visualGroupId);
  if (
    id === undefined ||
    !SHAPES.has(record.shape as BabylonNativeBlockShapeKindV1) ||
    !PALETTE_ROLES.has(record.paletteRole as BabylonNativeBlockPaletteRoleV1) ||
    (record.visualGroupId !== undefined && visualGroupId === undefined)
  ) {
    return fail(
      code,
      "id, shape, paletteRole, or visualGroupId is outside the closed Profile",
    );
  }
  return Object.freeze({
    id,
    shape: record.shape as BabylonNativeBlockShapeKindV1,
    paletteRole: record.paletteRole as BabylonNativeBlockPaletteRoleV1,
    ...(visualGroupId === undefined ? {} : { visualGroupId }),
  });
}

export function createBabylonNativeBlockProfileSessionV1(
  context: BabylonNativeSceneBuildContextV1,
  requestedBudget: Readonly<BabylonNativeBlockProfileBudgetV1>,
): BabylonNativeBlockProfileSessionV1 {
  const budget = parseBudget(requestedBudget);
  if (!(context.scene instanceof Scene) || context.scene.isDisposed) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_SCENE_INVALID",
      "the Profile requires one live Host Candidate Scene",
    );
  }
  if (
    context.bootstrap.nativeSceneProfileRef !==
      BABYLON_NATIVE_BLOCK_PROFILE_REF_V1
  ) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_PROFILE_MISMATCH",
      "bootstrap.nativeSceneProfileRef does not select whitebox.blocks@1",
    );
  }

  let isFinalized = false;
  let finalizedResult: BabylonNativeBlockProfileCheckResultV1 | undefined;
  const recordsById = new Map<string, BabylonNativeBlockSessionRecordV1>();

  return Object.freeze({
    createBlock(input: Readonly<BabylonNativeBlockDefinitionV1>): Mesh {
      if (isFinalized) {
        return fail(
          "WORLDKIT_NATIVE_BLOCK_SESSION_CLOSED",
          "createBlock is unavailable after finalize",
        );
      }
      const definition = parseDefinition(input);
      if (recordsById.has(definition.id)) {
        return fail(
          "WORLDKIT_NATIVE_BLOCK_ID_DUPLICATE",
          `block id '${definition.id}' is already used in this session`,
        );
      }
      if (recordsById.size >= budget.maximumBlockCount) {
        return fail(
          "WORLDKIT_NATIVE_BLOCK_COUNT_EXCEEDED",
          "block creation exceeds the caller-authorized hard cap",
        );
      }
      const size = BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1[
        definition.shape
      ];
      const mesh = MeshBuilder.CreateBox(
        definition.id,
        { width: size[0], height: size[1], depth: size[2] },
        context.scene,
      );
      recordsById.set(definition.id, Object.freeze({ definition, mesh }));
      return mesh;
    },
    finalize(): BabylonNativeBlockProfileCheckResultV1 {
      if (finalizedResult !== undefined) return finalizedResult;
      isFinalized = true;
      const records = Object.freeze([...recordsById.values()]);
      const layout = deriveBabylonNativeBlockLayoutV1(context.scene, records);
      finalizedResult = createBabylonNativeBlockProfileCheckResultV1(
        context.bootstrap.id,
        records,
        layout,
      );
      recordsById.clear();
      return finalizedResult;
    },
  });
}
