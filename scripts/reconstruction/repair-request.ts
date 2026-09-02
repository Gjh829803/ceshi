import { isEmpty, isEqual, isNil } from "lodash-es";
import type { Sha256HashV1 } from "@whitebox-world/protocol";
import type {
  WorldReconstructionDiagnosticV1,
  WorldReconstructionEvaluationProfileV1,
  WorldReconstructionEvaluationResultV1,
} from "@whitebox-world/validation";
import { parseWorldReconstructionDiagnosticV1 } from "@whitebox-world/validation";

export const NATIVE_BLOCK_REPAIR_WRITABLE_OUTPUT_PATHS_V1 = Object.freeze([
  "scene.ts",
  "native-block-authoring.json",
  "native-resources.json",
] as const);

export const NATIVE_BLOCK_REPAIR_FORBIDDEN_MUTATION_TARGETS_V1 = Object.freeze([
  "case",
  "profile",
  "gameplay-bootstrap",
  "world-runtime-bootstrap",
  "world-bounds",
  "derived-bootstrap",
  "acceptance-thresholds",
  "runtime",
  "physics",
  "camera",
  "evaluator",
  "prior-package",
  "prior-capture",
  "prior-durable-attempt-inputs",
] as const);

import type { WorldReconstructionFrozenOwnerIdentitiesV1 } from "./generation-request.js";
export type { WorldReconstructionFrozenOwnerIdentitiesV1 } from "./generation-request.js";

export interface NativeBlockRepairInstructionV1 {
  readonly kind: "native-block-repair-instruction";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly priorAttemptIndex: 0;
  readonly nextAttemptIndex: 1;
  readonly diagnostics: readonly WorldReconstructionDiagnosticV1[];
  readonly priorSourceRef: string;
  readonly priorSourceHash: Sha256HashV1;
  readonly priorEvaluationResultRef: string;
  readonly priorEvaluationResultHash: Sha256HashV1;
  readonly priorGenerationRequestRef: string;
  readonly priorGenerationRequestHash: Sha256HashV1;
  readonly frozenOwnerIdentities: WorldReconstructionFrozenOwnerIdentitiesV1;
  readonly declaredWritableOutputPaths:
    typeof NATIVE_BLOCK_REPAIR_WRITABLE_OUTPUT_PATHS_V1;
  readonly forbiddenMutationTargets:
    typeof NATIVE_BLOCK_REPAIR_FORBIDDEN_MUTATION_TARGETS_V1;
}

export interface CreateNativeBlockRepairInstructionInputV1 {
  readonly diagnostics: readonly WorldReconstructionDiagnosticV1[];
  readonly priorSourceRef: string;
  readonly priorSourceHash: Sha256HashV1;
  readonly priorEvaluationResultRef: string;
  readonly priorEvaluationResultHash: Sha256HashV1;
  readonly priorGenerationRequestRef: string;
  readonly priorGenerationRequestHash: Sha256HashV1;
  readonly frozenOwnerIdentities: WorldReconstructionFrozenOwnerIdentitiesV1;
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function parseNativeBlockRepairInstructionV1(
  input: unknown,
): NativeBlockRepairInstructionV1 {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input) || Reflect.getPrototypeOf(input) !== Object.prototype) {
    fail("WORLD_RECONSTRUCTION_REPAIR_INSTRUCTION_INVALID", "not a plain record");
  }
  const value = input as Record<string, unknown>;
  const expectedKeys = [
    "kind", "schemaVersion", "id", "priorAttemptIndex", "nextAttemptIndex",
    "diagnostics", "priorSourceRef", "priorSourceHash", "priorEvaluationResultRef",
    "priorEvaluationResultHash", "priorGenerationRequestRef", "priorGenerationRequestHash",
    "frozenOwnerIdentities", "declaredWritableOutputPaths", "forbiddenMutationTargets",
  ];
  if (Object.keys(value).length !== expectedKeys.length || Object.keys(value).some((key) => !expectedKeys.includes(key))) {
    fail("WORLD_RECONSTRUCTION_REPAIR_INSTRUCTION_INVALID", "unexpected fields");
  }
  if (
    value.kind !== "native-block-repair-instruction" || value.schemaVersion !== 1 ||
    typeof value.id !== "string" || value.priorAttemptIndex !== 0 || value.nextAttemptIndex !== 1 ||
    !Array.isArray(value.diagnostics) || value.diagnostics.length === 0 ||
    typeof value.priorSourceRef !== "string" || typeof value.priorEvaluationResultRef !== "string" ||
    typeof value.priorGenerationRequestRef !== "string" ||
    ![value.priorSourceHash, value.priorEvaluationResultHash, value.priorGenerationRequestHash].every((hash) => typeof hash === "string" && SHA256_PATTERN.test(hash)) ||
    !isEqual(value.declaredWritableOutputPaths, NATIVE_BLOCK_REPAIR_WRITABLE_OUTPUT_PATHS_V1) ||
    !isEqual(value.forbiddenMutationTargets, NATIVE_BLOCK_REPAIR_FORBIDDEN_MUTATION_TARGETS_V1)
  ) {
    fail("WORLD_RECONSTRUCTION_REPAIR_INSTRUCTION_INVALID", "closed fields");
  }
  const owner = value.frozenOwnerIdentities as Record<string, unknown>;
  const ownerKeys = ["caseHash", "evaluationProfileHash", "gameplayBootstrapHash", "worldRuntimeBootstrapHash", "worldBoundsHash", "bootstrapInputHash"];
  if (typeof owner !== "object" || isNil(owner) || Array.isArray(owner) || Object.keys(owner).length !== ownerKeys.length || ownerKeys.some((key) => typeof owner[key] !== "string" || !SHA256_PATTERN.test(owner[key] as string))) {
    fail("WORLD_RECONSTRUCTION_REPAIR_INSTRUCTION_INVALID", "owner identities");
  }
  const parsed = createNativeBlockRepairInstructionV1({
    diagnostics: value.diagnostics.map((diagnostic) =>
      parseWorldReconstructionDiagnosticV1(diagnostic)
    ),
    priorSourceRef: value.priorSourceRef,
    priorSourceHash: value.priorSourceHash as Sha256HashV1,
    priorEvaluationResultRef: value.priorEvaluationResultRef,
    priorEvaluationResultHash: value.priorEvaluationResultHash as Sha256HashV1,
    priorGenerationRequestRef: value.priorGenerationRequestRef,
    priorGenerationRequestHash: value.priorGenerationRequestHash as Sha256HashV1,
    frozenOwnerIdentities: owner as unknown as WorldReconstructionFrozenOwnerIdentitiesV1,
  });
  if (parsed.id !== value.id) fail("WORLD_RECONSTRUCTION_REPAIR_INSTRUCTION_INVALID", "identity");
  return parsed;
}

function fail(code: string, detail: string): never {
  throw new Error(`${code}: ${detail}`);
}

export function isRepairableWorldReconstructionDiagnosticV1(
  diagnostic: WorldReconstructionDiagnosticV1,
): boolean {
  return "repairAction" in diagnostic &&
    diagnostic.repairAction.kind === "revise-native-source";
}

export function isRepairableWorldReconstructionEvaluationV1(
  evaluation: WorldReconstructionEvaluationResultV1,
  profile: WorldReconstructionEvaluationProfileV1,
  completedRepairCount: 0 | 1,
): boolean {
  if (evaluation.outcome !== "failed") return false;
  if (completedRepairCount >= profile.maximumRepairAttemptCount) return false;
  if (isEmpty(evaluation.diagnostics)) return false;
  return evaluation.diagnostics.every((diagnostic) =>
    isRepairableWorldReconstructionDiagnosticV1(diagnostic)
  );
}

export function createNativeBlockRepairInstructionV1(
  input: CreateNativeBlockRepairInstructionInputV1,
): NativeBlockRepairInstructionV1 {
  if (isEmpty(input.diagnostics) || isNil(input.diagnostics[0])) {
    fail(
      "WORLD_RECONSTRUCTION_NON_REPAIRABLE",
      "diagnostics must not be empty",
    );
  }
  if (
    input.diagnostics.some((diagnostic) =>
      !isRepairableWorldReconstructionDiagnosticV1(diagnostic)
    )
  ) {
    fail(
      "WORLD_RECONSTRUCTION_NON_REPAIRABLE",
      "diagnostics are not source repairable",
    );
  }
  return Object.freeze({
    kind: "native-block-repair-instruction",
    schemaVersion: 1,
    id: `native-block-repair:${input.priorEvaluationResultHash}`,
    priorAttemptIndex: 0,
    nextAttemptIndex: 1,
    diagnostics: Object.freeze([...input.diagnostics]),
    priorSourceRef: input.priorSourceRef,
    priorSourceHash: input.priorSourceHash,
    priorEvaluationResultRef: input.priorEvaluationResultRef,
    priorEvaluationResultHash: input.priorEvaluationResultHash,
    priorGenerationRequestRef: input.priorGenerationRequestRef,
    priorGenerationRequestHash: input.priorGenerationRequestHash,
    frozenOwnerIdentities: Object.freeze({ ...input.frozenOwnerIdentities }),
    declaredWritableOutputPaths: NATIVE_BLOCK_REPAIR_WRITABLE_OUTPUT_PATHS_V1,
    forbiddenMutationTargets: NATIVE_BLOCK_REPAIR_FORBIDDEN_MUTATION_TARGETS_V1,
  });
}
