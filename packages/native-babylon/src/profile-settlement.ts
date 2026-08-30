import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type { BabylonNativeProfileSettlementReceiptV1 } from
  "@whitebox-world/runtime-contracts";
import { isEqual, isNil } from "lodash-es";

import type { BabylonNativeSceneBuildContextV1 } from "./module.js";

const BLOCK_PROFILE_REF =
  "worldkit://native-scene-profile/whitebox.blocks@1" as const;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

export type BabylonNativeProfileSettlementCollisionBindingV1 =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "static-collider"; colliderId: string }>;

export interface BabylonNativeProfileSettlementTargetV1 {
  readonly elementId: string;
  readonly mesh: Mesh;
  readonly collisionBinding: BabylonNativeProfileSettlementCollisionBindingV1;
}

export interface BabylonNativeProfileSettlementBatchV1 {
  readonly kind: "babylon-native-profile-settlement-batch";
  readonly schemaVersion: 1;
  readonly profileRef: string;
  readonly profileInventoryHash: `sha256:${string}`;
  readonly targets: readonly BabylonNativeProfileSettlementTargetV1[];
}

export class BabylonNativeProfileSettlementFailureV1 extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly repairHint: string,
  ) {
    super(`${code}: ${message}`);
  }
}

interface TargetFingerprintV1 {
  readonly elementId: string;
  readonly collisionBinding: BabylonNativeProfileSettlementCollisionBindingV1;
  readonly worldPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
  readonly localPositionMetersXYZ: readonly [number, number, number];
  readonly localRotationRadiansXYZ: readonly [number, number, number];
  readonly localRotationQuaternionXYZW:
    | readonly [number, number, number, number]
    | null;
  readonly localScalingXYZ: readonly [number, number, number];
  readonly isVisible: true;
  readonly visibilityRatio: number;
  readonly isEnabled: true;
}

export interface RetainedBabylonNativeProfileSettlementTargetV1 {
  readonly elementId: string;
  readonly mesh: Mesh;
  readonly collisionBinding: BabylonNativeProfileSettlementCollisionBindingV1;
  readonly fingerprint: TargetFingerprintV1;
}

export interface FinalizedBabylonNativeProfileSettlementV1 {
  readonly receipt: BabylonNativeProfileSettlementReceiptV1;
  readonly targets: readonly RetainedBabylonNativeProfileSettlementTargetV1[];
}

interface RecorderStateV1 {
  accepting: boolean;
  firstFailure?: BabylonNativeProfileSettlementFailureV1;
  batch?: Readonly<{
    profileInventoryHash: `sha256:${string}`;
    targets: readonly RetainedBabylonNativeProfileSettlementTargetV1[];
  }>;
}

const RECORDER_BY_CONTEXT = new WeakMap<
  BabylonNativeSceneBuildContextV1,
  RecorderStateV1
>();

function failure(
  code: string,
  message: string,
  repairHint: string,
): BabylonNativeProfileSettlementFailureV1 {
  return Object.freeze(new BabylonNativeProfileSettlementFailureV1(
    code,
    message,
    repairHint,
  ));
}

function invalidBatch(): BabylonNativeProfileSettlementFailureV1 {
  return failure(
    "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_INVALID",
    "Profile settlement must use the closed Host batch contract.",
    "Submit one exact settlement batch from the selected Native Scene Profile.",
  );
}

function exactRecord(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    isNil(input) ||
    Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Object.prototype
  ) throw invalidBatch();
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== "string" || !fields.includes(key)) ||
    fields.some((field) => !keys.includes(field))
  ) throw invalidBatch();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (
      isNil(descriptor) ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) throw invalidBatch();
    output[field] = descriptor.value;
  }
  return output;
}

function exactArray(input: unknown): readonly unknown[] {
  if (
    !Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Array.prototype ||
    Reflect.ownKeys(input).some((key) => typeof key === "symbol") ||
    Object.getOwnPropertyNames(input).length !== input.length + 1
  ) throw invalidBatch();
  const output: unknown[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
    if (
      isNil(descriptor) ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) throw invalidBatch();
    output.push(descriptor.value);
  }
  return output;
}

function identity(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.normalize("NFC") !== value
  ) throw invalidBatch();
  return value;
}

function canonicalNumber(value: number): number {
  if (!Number.isFinite(value)) throw invalidBatch();
  return Object.is(value, -0) ? 0 : value;
}

function collisionBinding(
  input: unknown,
): BabylonNativeProfileSettlementCollisionBindingV1 {
  if (
    typeof input !== "object" ||
    isNil(input) ||
    Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Object.prototype
  ) throw invalidBatch();
  const kindDescriptor = Reflect.getOwnPropertyDescriptor(input, "kind");
  if (
    isNil(kindDescriptor) ||
    !kindDescriptor.enumerable ||
    !("value" in kindDescriptor)
  ) throw invalidBatch();
  if (kindDescriptor.value === "none") {
    exactRecord(input, ["kind"]);
    return Object.freeze({ kind: "none" });
  }
  if (kindDescriptor.value === "static-collider") {
    const record = exactRecord(input, ["kind", "colliderId"]);
    return Object.freeze({
      kind: "static-collider",
      colliderId: identity(record.colliderId),
    });
  }
  throw invalidBatch();
}

function targetInvalid(elementId: string): BabylonNativeProfileSettlementFailureV1 {
  return failure(
    "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_TARGET_INVALID",
    `Profile settlement target '${elementId}' must be one ordinary visible Mesh in the Candidate Scene.`,
    "Use an unparented, non-instanced, physics-free indexed Mesh owned by context.scene.",
  );
}

function fingerprintTarget(
  context: BabylonNativeSceneBuildContextV1,
  elementId: string,
  mesh: Mesh,
  binding: BabylonNativeProfileSettlementCollisionBindingV1,
): TargetFingerprintV1 {
  try {
    if (
      mesh.isDisposed() ||
      mesh.getScene() !== context.scene ||
      !isNil(mesh.parent) ||
      mesh.instances.length !== 0 ||
      mesh.hasThinInstances ||
      !isNil(mesh.physicsBody) ||
      mesh.isVisible !== true ||
      !Number.isFinite(mesh.visibility) ||
      mesh.visibility <= 0 ||
      mesh.isEnabled() !== true
    ) throw targetInvalid(elementId);
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (
      isNil(positions) ||
      positions.length < 9 ||
      positions.length % 3 !== 0 ||
      !positions.every(Number.isFinite) ||
      isNil(indices) ||
      indices.length === 0 ||
      indices.length % 3 !== 0
    ) throw targetInvalid(elementId);
    const vertexCount = positions.length / 3;
    if (!indices.every((index) =>
      Number.isSafeInteger(index) && index >= 0 && index < vertexCount
    )) throw targetInvalid(elementId);
    const matrix = mesh.computeWorldMatrix(true);
    if (!matrix.asArray().every(Number.isFinite)) throw targetInvalid(elementId);
    const local = new Vector3();
    const world = new Vector3();
    const worldPositionsMetersXYZ: number[] = [];
    for (let index = 0; index < positions.length; index += 3) {
      local.set(positions[index]!, positions[index + 1]!, positions[index + 2]!);
      Vector3.TransformCoordinatesToRef(local, matrix, world);
      worldPositionsMetersXYZ.push(
        canonicalNumber(world.x),
        canonicalNumber(world.y),
        canonicalNumber(world.z),
      );
    }
    const localPositionMetersXYZ = Object.freeze([
      canonicalNumber(mesh.position.x),
      canonicalNumber(mesh.position.y),
      canonicalNumber(mesh.position.z),
    ] as const);
    const localRotationRadiansXYZ = Object.freeze([
      canonicalNumber(mesh.rotation.x),
      canonicalNumber(mesh.rotation.y),
      canonicalNumber(mesh.rotation.z),
    ] as const);
    const localRotationQuaternionXYZW = isNil(mesh.rotationQuaternion)
      ? null
      : Object.freeze([
          canonicalNumber(mesh.rotationQuaternion.x),
          canonicalNumber(mesh.rotationQuaternion.y),
          canonicalNumber(mesh.rotationQuaternion.z),
          canonicalNumber(mesh.rotationQuaternion.w),
        ] as const);
    const localScalingXYZ = Object.freeze([
      canonicalNumber(mesh.scaling.x),
      canonicalNumber(mesh.scaling.y),
      canonicalNumber(mesh.scaling.z),
    ] as const);
    return Object.freeze({
      elementId,
      collisionBinding: binding,
      worldPositionsMetersXYZ: Object.freeze(worldPositionsMetersXYZ),
      triangleIndices: Object.freeze([...indices]),
      localPositionMetersXYZ,
      localRotationRadiansXYZ,
      localRotationQuaternionXYZW,
      localScalingXYZ,
      isVisible: true,
      visibilityRatio: canonicalNumber(mesh.visibility),
      isEnabled: true,
    });
  } catch (error) {
    if (error instanceof BabylonNativeProfileSettlementFailureV1) throw error;
    throw targetInvalid(elementId);
  }
}

function retainFailure(
  state: RecorderStateV1,
  problem: BabylonNativeProfileSettlementFailureV1,
): never {
  state.firstFailure ??= problem;
  throw problem;
}

export function beginBabylonNativeProfileSettlementRecorderV1(
  context: BabylonNativeSceneBuildContextV1,
): void {
  if (RECORDER_BY_CONTEXT.has(context)) {
    throw failure(
      "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_DUPLICATE",
      "Profile settlement recorder is already bound to this Build Context.",
      "Bind exactly one recorder for the active Candidate Build Epoch.",
    );
  }
  RECORDER_BY_CONTEXT.set(context, { accepting: true });
}

export function commitBabylonNativeProfileSettlementV1(
  context: BabylonNativeSceneBuildContextV1,
  batch: Readonly<BabylonNativeProfileSettlementBatchV1>,
): void {
  const state = RECORDER_BY_CONTEXT.get(context);
  if (isNil(state)) {
    throw failure(
      "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_UNAVAILABLE",
      "Profile settlement is available only in the active Candidate Build Epoch.",
      "Commit from the selected Profile during Module build().",
    );
  }
  if (!state.accepting) {
    return retainFailure(state, failure(
      "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_CLOSED",
      "Profile settlement registration is closed.",
      "Commit exactly once before Module build() resolves.",
    ));
  }
  if (!isNil(state.batch)) {
    return retainFailure(state, failure(
      "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_DUPLICATE",
      "Profile settlement may be committed exactly once.",
      "Keep one Profile-owned finalize call per Candidate Build Epoch.",
    ));
  }

  try {
    const record = exactRecord(batch, [
      "kind",
      "schemaVersion",
      "profileRef",
      "profileInventoryHash",
      "targets",
    ]);
    if (
      record.kind !== "babylon-native-profile-settlement-batch" ||
      record.schemaVersion !== 1
    ) throw invalidBatch();
    if (
      record.profileRef !== BLOCK_PROFILE_REF ||
      record.profileRef !== context.bootstrap.nativeSceneProfileRef
    ) {
      throw failure(
        "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_PROFILE_MISMATCH",
        "Profile settlement does not match bootstrap.nativeSceneProfileRef.",
        "Commit only from the exact authoring Profile selected by the Bootstrap.",
      );
    }
    if (
      typeof record.profileInventoryHash !== "string" ||
      !SHA256_PATTERN.test(record.profileInventoryHash)
    ) throw invalidBatch();
    const targets = exactArray(record.targets);
    const elementIds = new Set<string>();
    const meshes = new Set<Mesh>();
    const retained = targets.map((target) => {
      const targetRecord = exactRecord(target, [
        "elementId",
        "mesh",
        "collisionBinding",
      ]);
      const elementId = identity(targetRecord.elementId);
      if (!(targetRecord.mesh instanceof Mesh)) throw targetInvalid(elementId);
      const mesh = targetRecord.mesh;
      if (elementIds.has(elementId) || meshes.has(mesh)) throw invalidBatch();
      elementIds.add(elementId);
      meshes.add(mesh);
      const binding = collisionBinding(targetRecord.collisionBinding);
      return Object.freeze({
        elementId,
        mesh,
        collisionBinding: binding,
        fingerprint: fingerprintTarget(context, elementId, mesh, binding),
      });
    }).sort((left, right) =>
      left.elementId < right.elementId
        ? -1
        : left.elementId > right.elementId
          ? 1
          : 0,
    );
    state.batch = Object.freeze({
      profileInventoryHash:
        record.profileInventoryHash as `sha256:${string}`,
      targets: Object.freeze(retained),
    });
  } catch (error) {
    return retainFailure(
      state,
      error instanceof BabylonNativeProfileSettlementFailureV1
        ? error
        : invalidBatch(),
    );
  }
}

export function closeBabylonNativeProfileSettlementRecorderV1(
  context: BabylonNativeSceneBuildContextV1,
): void {
  const state = RECORDER_BY_CONTEXT.get(context);
  if (!isNil(state)) state.accepting = false;
}

export function finalizeBabylonNativeProfileSettlementV1(
  context: BabylonNativeSceneBuildContextV1,
): FinalizedBabylonNativeProfileSettlementV1 {
  const state = RECORDER_BY_CONTEXT.get(context);
  if (isNil(state)) {
    throw failure(
      "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_UNAVAILABLE",
      "Profile settlement recorder is not bound.",
      "Finalize only the active Candidate Build Epoch.",
    );
  }
  if (state.accepting) {
    throw failure(
      "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_CLOSED",
      "Profile settlement cannot finalize while Module build() is active.",
      "Close the Build Epoch before settlement recheck.",
    );
  }
  if (!isNil(state.firstFailure)) throw state.firstFailure;
  if (
    context.bootstrap.nativeSceneProfileRef ===
      "worldkit://native-scene-profile/whitebox.standard@1"
  ) {
    if (!isNil(state.batch)) {
      throw failure(
        "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_PROFILE_MISMATCH",
        "The standard Native Scene Profile must not publish a settlement batch.",
        "Remove the Profile settlement commit from standard Native Modules.",
      );
    }
    return Object.freeze({
      receipt: Object.freeze({
        kind: "none",
        profileRef: "worldkit://native-scene-profile/whitebox.standard@1",
      }),
      targets: Object.freeze([]),
    });
  }
  if (context.bootstrap.nativeSceneProfileRef !== BLOCK_PROFILE_REF) {
    throw failure(
      "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_PROFILE_MISMATCH",
      "Native Scene Profile is outside the closed settlement map.",
      "Select whitebox.standard@1 or whitebox.blocks@1 before Candidate allocation.",
    );
  }
  if (isNil(state.batch)) {
    throw failure(
      "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_REQUIRED",
      "The selected Native Scene Profile requires one settlement batch.",
      "Call the Block Profile session finalize() exactly once during build().",
    );
  }
  const targets = state.batch.targets.map((target) => {
    let actual: TargetFingerprintV1;
    try {
      actual = fingerprintTarget(
        context,
        target.elementId,
        target.mesh,
        target.collisionBinding,
      );
    } catch {
      throw failure(
        "WORLDKIT_NATIVE_SCENE_PROFILE_TARGET_DRIFT",
        `Profile target '${target.elementId}' changed after settlement commit.`,
        "Complete geometry, transforms, visibility and collision joins before finalize().",
      );
    }
    if (!isEqual(actual, target.fingerprint)) {
      throw failure(
        "WORLDKIT_NATIVE_SCENE_PROFILE_TARGET_DRIFT",
        `Profile target '${target.elementId}' changed after settlement commit.`,
        "Complete geometry, transforms, visibility and collision joins before finalize().",
      );
    }
    return target;
  });
  const settledVisualHash = sha256CanonicalJson({
    kind: "babylon-native-profile-settled-visuals",
    schemaVersion: 1,
    profileRef: BLOCK_PROFILE_REF,
    targets: targets.map(({ fingerprint }) => ({
      elementId: fingerprint.elementId,
      collisionBinding: fingerprint.collisionBinding,
      worldPositionsMetersXYZ: fingerprint.worldPositionsMetersXYZ,
      triangleIndices: fingerprint.triangleIndices,
      isVisible: fingerprint.isVisible,
      visibilityRatio: fingerprint.visibilityRatio,
      isEnabled: fingerprint.isEnabled,
    })),
  }) as `sha256:${string}`;
  return Object.freeze({
    receipt: Object.freeze({
      kind: "host-snapshot",
      profileRef: BLOCK_PROFILE_REF,
      targetCount: targets.length,
      profileInventoryHash: state.batch.profileInventoryHash,
      settledVisualHash,
    }),
    targets: Object.freeze([...targets]),
  });
}

export function unbindBabylonNativeProfileSettlementRecorderV1(
  context: BabylonNativeSceneBuildContextV1,
): void {
  RECORDER_BY_CONTEXT.delete(context);
}
