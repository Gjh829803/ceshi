import { isNil } from "lodash-es";
import { sha256Bytes } from "@whitebox-world/protocol";
import type { BabylonNativeTraversalBindingV1 } from "@whitebox-world/native-babylon";
import type {
  BabylonNativeBlockProfileBudgetV1, BabylonNativeBlockCreateInputV1,
} from "./session.js";
import type {
  BabylonNativeBlockColliderGeometrySourceV1, BabylonNativeBlockStaticColliderSelectionV1,
} from "./collider-contribution.js";
import {
  BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1, isBabylonNativeBlockIdV1,
  type BabylonNativeBlockPaletteRoleV1,
} from "./profile.js";
import {
  BABYLON_NATIVE_BLOCK_ROTATION_QUARTER_TURNS_Y_V1,
  babylonNativeBlockCenterAlignsToGridV1,
  canonicalizeBabylonNativeBlockCenterToGridV1,
  canonicalizeBabylonNativeBlockEvidenceNumberV1,
  effectiveBabylonNativeBlockSizeMetersXYZV1,
  type BabylonNativeBlockPositionMetersXYZV1,
  type BabylonNativeBlockRotationQuarterTurnsYV1,
  type BabylonNativeBlockShapeKindV1,
} from "./shapes.js";

const SHAPES = new Set<BabylonNativeBlockShapeKindV1>([
  "full", "half", "quarter", "small", "step",
]);
const PALETTE_ROLES = new Set<BabylonNativeBlockPaletteRoleV1>(
  BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1,
);
const QUARTER_TURNS = new Set<number>(
  BABYLON_NATIVE_BLOCK_ROTATION_QUARTER_TURNS_Y_V1,
);

/**
 * One authoring-input grammar for the Host and disposable task feedback.
 * Host passes its branded failure boundary and uses only this realm. The VM
 * renderer additionally identifies its ordinary Object/Array prototypes before
 * executing source; it does not coerce inputs or read accessors to cross realms.
 * Geometry, allocation, Collider admission and Runtime remain Host-owned.
 */
export function createBabylonNativeBlockInputParsersV1(
  fail: (code: string, detail: string) => never,
  inputRealm?: Readonly<{ objectPrototype: object; arrayPrototype: object }>,
) {
  function isInputPrototype(prototype: object | null, kind: "object" | "array"): boolean {
    return prototype === (kind === "object" ? Object.prototype : Array.prototype) ||
      (inputRealm !== undefined &&
        prototype === (kind === "object" ? inputRealm.objectPrototype : inputRealm.arrayPrototype));
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
      if (!isInputPrototype(Reflect.getPrototypeOf(input), "object")) {
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
    if (!Array.isArray(input) || !isInputPrototype(Reflect.getPrototypeOf(input), "array")) {
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
    return isBabylonNativeBlockIdV1(value) ? value : undefined;
  }

  function requireId(value: unknown, field: string, code: string): string {
    const id = canonicalId(value);
    if (id !== undefined) return id;
    // Never stringify arbitrary objects: an invalid input must not execute toString.
    const label = typeof value !== "string" ? typeof value
      : value.length <= 80 ? value
      : `${value.slice(0, 80)}...[${sha256Bytes(new TextEncoder().encode(value))}]`;
    const escaped = JSON.stringify(label).slice(1, -1).replace(
      /['\u007f-\u009f\u2028\u2029]/g,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
    return fail(code, `${field} '${escaped}' is outside the closed Profile identifier contract`);
  }

  function canonicalIdentity(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 &&
        value.trim() === value && value.normalize("NFC") === value
      ? value : undefined;
  }

  function parseBudget(
    input: unknown,
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

  function parseFiniteNumberTupleXYZ(
    input: unknown,
    code: string,
    fieldName: string,
  ): BabylonNativeBlockPositionMetersXYZV1 {
    if (!Array.isArray(input) ||
        !isInputPrototype(Reflect.getPrototypeOf(input), "array") ||
        input.length !== 3 ||
        Object.getOwnPropertyNames(input).length !== 4) {
      return fail(code, `${fieldName} must be one ordinary dense XYZ tuple`);
    }
    const values: number[] = [];
    for (let axis = 0; axis < 3; axis += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, String(axis));
      if (isNil(descriptor) || !descriptor.enumerable || !("value" in descriptor) ||
          typeof descriptor.value !== "number" ||
          !Number.isFinite(descriptor.value)) {
        return fail(code, `${fieldName} must hold three finite plain numbers`);
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
    input: unknown,
  ): Readonly<BabylonNativeBlockCreateInputV1> {
    const code = "WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID";
    const record = exactPlainRecord(input,
      ["id", "shape", "paletteRole", "centerMetersXYZ"],
      ["rotationQuarterTurnsY", "visualGroupId", "colliderGroupId"], code);
    const id = requireId(record.id, "id", code);
    const hasVisualGroupId = Object.hasOwn(record, "visualGroupId");
    const visualGroupId = hasVisualGroupId
      ? requireId(record.visualGroupId, "visualGroupId", code) : undefined;
    const hasColliderGroupId = Object.hasOwn(record, "colliderGroupId");
    const colliderGroupId = hasColliderGroupId
      ? requireId(record.colliderGroupId, "colliderGroupId", code) : undefined;
    if (isNil(id) ||
        !SHAPES.has(record.shape as BabylonNativeBlockShapeKindV1) ||
        !PALETTE_ROLES.has(record.paletteRole as BabylonNativeBlockPaletteRoleV1) ||
        (hasVisualGroupId && isNil(visualGroupId)) ||
        (hasColliderGroupId && isNil(colliderGroupId))) {
      return fail(code,
        "id, shape, paletteRole, visualGroupId, or colliderGroupId is outside the closed Profile");
    }
    const shape = record.shape as BabylonNativeBlockShapeKindV1;
    const declaredCenterMetersXYZ = parseFiniteNumberTupleXYZ(
      record.centerMetersXYZ,
      code,
      "centerMetersXYZ",
    );
    const rotationQuarterTurnsY = parseQuarterTurns(record, code);
    if (!babylonNativeBlockCenterAlignsToGridV1({
      shape,
      centerMetersXYZ: declaredCenterMetersXYZ,
      rotationQuarterTurnsY,
    })) {
      return fail(code,
        `center ${JSON.stringify(declaredCenterMetersXYZ)} is off the '${shape}' occupancy grid`);
    }
    const centerMetersXYZ = canonicalizeBabylonNativeBlockCenterToGridV1(
      declaredCenterMetersXYZ,
    );
    return Object.freeze({
      id,
      shape,
      paletteRole: record.paletteRole as BabylonNativeBlockPaletteRoleV1,
      centerMetersXYZ,
      rotationQuarterTurnsY,
      ...(isNil(visualGroupId) ? {} : { visualGroupId }),
      ...(isNil(colliderGroupId) ? {} : { colliderGroupId }),
    });
  }

  function parseGridCreateInput(
    input: unknown,
    remainingBlockCount: number,
  ): readonly Readonly<BabylonNativeBlockCreateInputV1>[] {
    const code = "WORLDKIT_NATIVE_BLOCK_GRID_CREATE_INPUT_INVALID";
    const record = exactPlainRecord(input,
      ["idPrefix", "shape", "paletteRole", "minimumCenterMetersXYZ",
        "repeatCountXYZ"],
      ["rotationQuarterTurnsY", "visualGroupId", "colliderGroupId"], code);
    const idPrefix = requireId(record.idPrefix, "idPrefix", code);
    const hasVisualGroupId = Object.hasOwn(record, "visualGroupId");
    const visualGroupId = hasVisualGroupId
      ? requireId(record.visualGroupId, "visualGroupId", code) : undefined;
    const hasColliderGroupId = Object.hasOwn(record, "colliderGroupId");
    const colliderGroupId = hasColliderGroupId
      ? requireId(record.colliderGroupId, "colliderGroupId", code) : undefined;
    if (isNil(idPrefix) ||
        !SHAPES.has(record.shape as BabylonNativeBlockShapeKindV1) ||
        !PALETTE_ROLES.has(record.paletteRole as BabylonNativeBlockPaletteRoleV1) ||
        (hasVisualGroupId && isNil(visualGroupId)) ||
        (hasColliderGroupId && isNil(colliderGroupId))) {
      return fail(code,
        "idPrefix, shape, paletteRole, visualGroupId, or colliderGroupId is outside the closed Profile");
    }
    const shape = record.shape as BabylonNativeBlockShapeKindV1;
    const paletteRole = record.paletteRole as BabylonNativeBlockPaletteRoleV1;
    const minimumCenterMetersXYZ = parseFiniteNumberTupleXYZ(
      record.minimumCenterMetersXYZ, code, "minimumCenterMetersXYZ",
    );
    const rotationQuarterTurnsY = parseQuarterTurns(record, code);
    const repeatCountXYZ = parseFiniteNumberTupleXYZ(
      record.repeatCountXYZ,
      code,
      "repeatCountXYZ",
    );
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
          const id = `${idPrefix}-x${xIndex}-y${yIndex}-z${zIndex}`;
          if (isNil(canonicalId(id))) {
            return fail(code,
              `derived Block id '${id}' is outside the stable ID contract`);
          }
          inputs.push(parseCreateInput(Object.freeze({
            id,
            shape,
            paletteRole,
            centerMetersXYZ: Object.freeze([
              minimumCenterMetersXYZ[0] + xIndex * spacing[0]!,
              minimumCenterMetersXYZ[1] + yIndex * spacing[1]!,
              minimumCenterMetersXYZ[2] + zIndex * spacing[2]!,
            ] as [number, number, number]),
            rotationQuarterTurnsY,
            ...(isNil(visualGroupId) ? {} : { visualGroupId }),
            ...(isNil(colliderGroupId) ? {} : { colliderGroupId }),
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

  function parseColliderGeometrySource(
    input: unknown,
    code: string,
  ): BabylonNativeBlockColliderGeometrySourceV1 {
    const record = exactPlainRecord(
      input,
      ["kind"],
      ["blockId", "colliderGroupId"],
      code,
    );
    if (record.kind === "block") {
      const branch = exactPlainRecord(input, ["kind", "blockId"], [], code);
      const blockId = canonicalId(branch.blockId);
      if (isNil(blockId)) {
        return fail(code, "blockId must be one stable lowercase ID");
      }
      return Object.freeze({ kind: "block", blockId });
    }
    if (record.kind === "block-group") {
      const branch = exactPlainRecord(input, ["kind", "colliderGroupId"], [], code);
      const colliderGroupId = canonicalId(branch.colliderGroupId);
      if (isNil(colliderGroupId)) {
        return fail(code, "colliderGroupId must be one stable lowercase ID");
      }
      return Object.freeze({ kind: "block-group", colliderGroupId });
    }
    return fail(code, "colliderGeometrySource.kind is outside the closed union");
  }

  function parseSelection(input: unknown): BabylonNativeBlockStaticColliderSelectionV1 {
    const code = "WORLDKIT_NATIVE_BLOCK_COLLIDER_SELECTION_INVALID";
    const record = exactPlainRecord(input,
      ["id", "colliderGeometrySource", "traversalBinding", "exposedEdgePolicy"],
      ["frictionRatio", "restitutionRatio"], code);
    const id = canonicalId(record.id);
    if (isNil(id)) {
      return fail(code, "Collider ID must be one stable lowercase ID");
    }
    const traversalBinding = parseTraversalBinding(record.traversalBinding, code);
    if (record.exposedEdgePolicy !== "none" &&
        record.exposedEdgePolicy !== "protect-ground-subject") {
      return fail(code, "exposedEdgePolicy is outside the closed union");
    }
    if (record.exposedEdgePolicy === "protect-ground-subject" &&
        traversalBinding.kind !== "static-surface") {
      return fail(code,
        "protect-ground-subject requires a static-surface traversal binding");
    }
    return Object.freeze({
      id,
      colliderGeometrySource: parseColliderGeometrySource(
        record.colliderGeometrySource,
        code,
      ),
      traversalBinding,
      exposedEdgePolicy: record.exposedEdgePolicy,
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
    input: unknown,
  ): Readonly<{
    staticColliders: readonly BabylonNativeBlockStaticColliderSelectionV1[];
  }> {
    const code = "WORLDKIT_NATIVE_BLOCK_FINALIZE_INPUT_INVALID";
    const record = exactPlainRecord(input, ["staticColliders"], [], code);
    const staticColliders = exactArray(record.staticColliders, code)
      .map(parseSelection)
      .sort((left, right) => stableCompare(left.id, right.id));
    const colliderIds = new Set<string>();
    const geometrySourceKeys = new Set<string>();
    for (const selection of staticColliders) {
      if (colliderIds.has(selection.id)) {
        return fail("WORLDKIT_NATIVE_BLOCK_COLLIDER_ID_DUPLICATE",
          `Collider id '${selection.id}' appears more than once`);
      }
      const geometrySourceKey = selection.colliderGeometrySource.kind === "block"
        ? `block:${selection.colliderGeometrySource.blockId}`
        : `block-group:${selection.colliderGeometrySource.colliderGroupId}`;
      if (geometrySourceKeys.has(geometrySourceKey)) {
        return fail("WORLDKIT_NATIVE_BLOCK_COLLIDER_GEOMETRY_SOURCE_DUPLICATE",
          `Collider geometry source '${geometrySourceKey}' appears more than once`);
      }
      colliderIds.add(selection.id);
      geometrySourceKeys.add(geometrySourceKey);
    }
    return Object.freeze({
      staticColliders: Object.freeze(staticColliders),
    });
  }

  return Object.freeze({ parseBudget, parseCreateInput, parseGridCreateInput, parseFinalizeInput });
}
