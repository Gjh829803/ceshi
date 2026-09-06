import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { isNil, sortBy } from "lodash-es";

export type SceneAuthoringRouteReasonCodeV1 =
  | "user-selected-canonical"
  | "native-production-not-released"
  | "hosted-native-not-admitted"
  | "requires-canonical-route"
  | "requires-world-change-set"
  | "requires-deterministic-layout"
  | "reference-driven-distinctive-silhouette"
  | "unsupported-enclosed-topology"
  | "unsupported-dynamic-multilayer-surface"
  | "user-selected-supported-lane";

export type WorldGenerationSceneSourceKindV1 =
  | "canonical"
  | "babylon-native";

export function parseWorldGenerationSceneSourceKindV1(
  input: unknown,
): WorldGenerationSceneSourceKindV1 {
  if (input === undefined) return "babylon-native";
  if (input === "canonical" || input === "babylon-native") return input;
  throw new TypeError("WORLD_GENERATION_SCENE_SOURCE_INVALID");
}

export interface SceneAuthoringRouteDecisionV1 {
  readonly kind: "scene-authoring-route-decision";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sceneBriefRef: string;
  readonly sceneBriefHash: Sha256HashV1;
  readonly trustProfileRef: string;
  readonly trustProfileHash: Sha256HashV1;
  readonly requiredCapabilityRefs: readonly string[];
  readonly decision:
    | Readonly<{
        kind: "canonical";
        authoringProfileRef: string;
        reasonCodes: readonly SceneAuthoringRouteReasonCodeV1[];
      }>
    | Readonly<{
        kind: "babylon-native";
        authoringProfileRef: string;
        compositionStrategy:
          | "ground-first"
          | "ground-first-with-locked-assets";
        reasonCodes: readonly SceneAuthoringRouteReasonCodeV1[];
      }>
    | Readonly<{
        kind: "capability-gap";
        unsupportedCapabilityRefs: readonly string[];
        reasonCodes: readonly SceneAuthoringRouteReasonCodeV1[];
      }>;
}

export interface DecideSceneAuthoringRouteV1Input {
  readonly id: string;
  readonly sceneBriefRef: string;
  readonly sceneBriefHash: Sha256HashV1;
  readonly trustProfileRef: string;
  readonly trustProfileHash: Sha256HashV1;
  readonly requiredCapabilityRefs: readonly string[];
  readonly requestedSourceKind: "canonical" | "babylon-native";
  readonly nativeTrustAdmitted: boolean;
  readonly referenceDrivenDistinctiveSilhouette: boolean;
}

export interface NativeBlockGenerationReferenceInputV1 {
  readonly inputRef: string;
  readonly contentHash: Sha256HashV1;
  readonly mediaType: "image/png" | "image/jpeg" | "image/webp";
}

export interface NativeBlockGenerationContextInputV1 {
  readonly inputRef: string;
  readonly contentHash: Sha256HashV1;
}

export interface NativeBlockGenerationBudgetV1 {
  readonly maximumStaticColliderCount: number;
  readonly maximumStaticColliderVertexCount: number;
  readonly maximumStaticColliderTriangleCount: number;
  readonly maximumOutputBytes: number;
  readonly timeoutSeconds: number;
}

export interface NativeBlockGenerationRequestV1 {
  readonly kind: "native-block-generation-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly routeDecisionRef: string;
  readonly routeDecisionHash: Sha256HashV1;
  readonly sceneBriefRef: string;
  readonly sceneBriefHash: Sha256HashV1;
  readonly referenceInputs: readonly NativeBlockGenerationReferenceInputV1[];
  readonly codexExecutionProfileRef: string;
  readonly codexExecutionProfileHash: Sha256HashV1;
  readonly taskInstructionRef: string;
  readonly taskInstructionHash: Sha256HashV1;
  readonly builderSkillRef: string;
  readonly builderSkillHash: Sha256HashV1;
  readonly workspaceContextManifestRef: string;
  readonly workspaceContextManifestHash: Sha256HashV1;
  readonly contextInputs: readonly NativeBlockGenerationContextInputV1[];
  readonly nativeSceneApiRef: string;
  readonly nativeSceneApiHash: Sha256HashV1;
  readonly nativeSceneProfileRef: string;
  readonly nativeSceneProfileHash: Sha256HashV1;
  readonly blockProfileRef: string;
  readonly blockProfileHash: Sha256HashV1;
  readonly bootstrapInputRef: string;
  readonly bootstrapInputHash: Sha256HashV1;
  readonly seed: number;
  readonly budgets: NativeBlockGenerationBudgetV1;
  readonly declaredOutputPaths: readonly [
    "scene.ts",
    "native-block-authoring.json",
    "native-resources.json",
  ];
}

export interface NativeBlockGenerationOutputV1 {
  readonly path:
    | "scene.ts"
    | "native-block-authoring.json"
    | "native-resources.json";
  readonly contentHash: Sha256HashV1;
  readonly sizeBytes: number;
  readonly mediaType: "text/typescript" | "application/json";
}

export type NativeBlockGenerationDiagnosticCodeV1 =
  | "cleanup-failed"
  | "creation-outcome-unknown"
  | "duplicate-request-mismatch"
  | "output-hash-mismatch"
  | "output-missing"
  | "output-unexpected"
  | "self-check-failed"
  | "stale-output"
  | "task-rejected"
  | "task-timeout"
  | "task-tool-error";

export interface NativeBlockGenerationReceiptV1 {
  readonly kind: "native-block-generation-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly generationRequestRef: string;
  readonly generationRequestHash: Sha256HashV1;
  readonly routerTaskPayloadHash: Sha256HashV1;
  readonly taskInstructionHash: Sha256HashV1;
  readonly builderSkillHash: Sha256HashV1;
  readonly workspaceContextManifestHash: Sha256HashV1;
  readonly routerRequestId: string;
  readonly backend: "cloud" | "local";
  readonly executionProfile: "formal";
  readonly resolvedModel: "gpt-5.6-sol";
  readonly resolvedReasoningEffort: "xhigh";
  readonly outcome: "completed" | "rejected" | "tool-error" | "unknown";
  readonly outputs: readonly NativeBlockGenerationOutputV1[];
  readonly diagnosticCodes: readonly NativeBlockGenerationDiagnosticCodeV1[];
  readonly cleanupOutcome: "completed" | "failed";
}

export interface SceneAuthoringSelectedAssetResourceV1 {
  readonly assetResourceRef: string;
  readonly assetPublicationReceiptRef: string;
  readonly assetPublicationReceiptHash: Sha256HashV1;
}

export interface SceneAuthoringAttemptV1 {
  readonly kind: "scene-authoring-attempt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sceneAuthoringRouteDecisionRef: string;
  readonly sceneAuthoringRouteDecisionHash: Sha256HashV1;
  readonly sceneBriefRef: string;
  readonly sceneBriefHash: Sha256HashV1;
  readonly sourceInput:
    | Readonly<{
        kind: "canonical";
        authoringInputRef: string;
        authoringInputHash: Sha256HashV1;
      }>
    | Readonly<{
        kind: "babylon-native";
        bootstrapInputRef: string;
        bootstrapInputHash: Sha256HashV1;
        generationRequestRef: string;
        generationRequestHash: Sha256HashV1;
      }>;
  readonly selectedAssetResources:
    readonly SceneAuthoringSelectedAssetResourceV1[];
  readonly seed: number;
  readonly authoringProfileRef: string;
  readonly acceptanceTargetRefs: readonly string[];
  readonly requiredEvidenceProfileRefs: readonly string[];
}

export type SceneAuthoringAttemptResultV1 =
  | Readonly<{
      kind: "scene-authoring-attempt-result";
      schemaVersion: 1;
      id: string;
      sceneAuthoringAttemptRef: string;
      sceneAuthoringAttemptHash: Sha256HashV1;
      outcome: "completed";
      authoredSourceRef: string;
      authoredSourceHash: Sha256HashV1;
      evidenceRefs: readonly string[];
    }>
  | Readonly<{
      kind: "scene-authoring-attempt-result";
      schemaVersion: 1;
      id: string;
      sceneAuthoringAttemptRef: string;
      sceneAuthoringAttemptHash: Sha256HashV1;
      outcome: "rejected" | "tool-error";
      diagnosticRefs: readonly string[];
    }>;

export type SceneAuthoringInvalidatedGateV1 =
  | "none"
  | "route-decision"
  | "source-authoring";

const ROUTE_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "id",
  "sceneBriefRef",
  "sceneBriefHash",
  "trustProfileRef",
  "trustProfileHash",
  "requiredCapabilityRefs",
  "decision",
] as const);
const ROUTE_INPUT_FIELDS = Object.freeze([
  "id",
  "sceneBriefRef",
  "sceneBriefHash",
  "trustProfileRef",
  "trustProfileHash",
  "requiredCapabilityRefs",
  "requestedSourceKind",
  "nativeTrustAdmitted",
  "referenceDrivenDistinctiveSilhouette",
] as const);
const CANONICAL_DECISION_FIELDS = Object.freeze([
  "kind",
  "authoringProfileRef",
  "reasonCodes",
] as const);
const NATIVE_DECISION_FIELDS = Object.freeze([
  "kind",
  "authoringProfileRef",
  "compositionStrategy",
  "reasonCodes",
] as const);
const GAP_DECISION_FIELDS = Object.freeze([
  "kind",
  "unsupportedCapabilityRefs",
  "reasonCodes",
] as const);
const ATTEMPT_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "id",
  "sceneAuthoringRouteDecisionRef",
  "sceneAuthoringRouteDecisionHash",
  "sceneBriefRef",
  "sceneBriefHash",
  "sourceInput",
  "selectedAssetResources",
  "seed",
  "authoringProfileRef",
  "acceptanceTargetRefs",
  "requiredEvidenceProfileRefs",
] as const);
const CANONICAL_SOURCE_FIELDS = Object.freeze([
  "kind",
  "authoringInputRef",
  "authoringInputHash",
] as const);
const NATIVE_SOURCE_FIELDS = Object.freeze([
  "kind",
  "bootstrapInputRef",
  "bootstrapInputHash",
  "generationRequestRef",
  "generationRequestHash",
] as const);
const SELECTED_ASSET_FIELDS = Object.freeze([
  "assetResourceRef",
  "assetPublicationReceiptRef",
  "assetPublicationReceiptHash",
] as const);
const COMPLETED_RESULT_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "id",
  "sceneAuthoringAttemptRef",
  "sceneAuthoringAttemptHash",
  "outcome",
  "authoredSourceRef",
  "authoredSourceHash",
  "evidenceRefs",
] as const);
const FAILED_RESULT_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "id",
  "sceneAuthoringAttemptRef",
  "sceneAuthoringAttemptHash",
  "outcome",
  "diagnosticRefs",
] as const);
const GENERATION_REQUEST_FIELDS = Object.freeze([
  "kind", "schemaVersion", "id", "routeDecisionRef", "routeDecisionHash",
  "sceneBriefRef", "sceneBriefHash", "referenceInputs",
  "codexExecutionProfileRef", "codexExecutionProfileHash",
  "taskInstructionRef", "taskInstructionHash", "builderSkillRef",
  "builderSkillHash", "workspaceContextManifestRef",
  "workspaceContextManifestHash", "contextInputs", "nativeSceneApiRef",
  "nativeSceneApiHash", "nativeSceneProfileRef", "nativeSceneProfileHash",
  "blockProfileRef", "blockProfileHash", "bootstrapInputRef",
  "bootstrapInputHash", "seed", "budgets", "declaredOutputPaths",
] as const);
const GENERATION_REFERENCE_INPUT_FIELDS = Object.freeze([
  "inputRef", "contentHash", "mediaType",
] as const);
const GENERATION_CONTEXT_INPUT_FIELDS = Object.freeze([
  "inputRef", "contentHash",
] as const);
const GENERATION_BUDGET_FIELDS = Object.freeze([
  "maximumStaticColliderCount",
  "maximumStaticColliderVertexCount", "maximumStaticColliderTriangleCount",
  "maximumOutputBytes", "timeoutSeconds",
] as const);
const GENERATION_RECEIPT_FIELDS = Object.freeze([
  "kind", "schemaVersion", "id", "generationRequestRef",
  "generationRequestHash", "routerTaskPayloadHash", "taskInstructionHash",
  "builderSkillHash", "workspaceContextManifestHash", "routerRequestId",
  "backend", "executionProfile", "resolvedModel",
  "resolvedReasoningEffort", "outcome", "outputs", "diagnosticCodes",
  "cleanupOutcome",
] as const);
const GENERATION_OUTPUT_FIELDS = Object.freeze([
  "path", "contentHash", "sizeBytes", "mediaType",
] as const);
const DECLARED_GENERATION_OUTPUT_PATHS = Object.freeze([
  "scene.ts",
  "native-block-authoring.json",
  "native-resources.json",
] as const);
const SORTED_GENERATION_OUTPUT_PATHS = Object.freeze([
  "native-block-authoring.json",
  "native-resources.json",
  "scene.ts",
] as const);
const GENERATION_DIAGNOSTIC_CODES = Object.freeze([
  "cleanup-failed", "creation-outcome-unknown", "duplicate-request-mismatch",
  "output-hash-mismatch", "output-missing", "output-unexpected",
  "self-check-failed", "stale-output", "task-rejected", "task-timeout",
  "task-tool-error",
] as const satisfies readonly NativeBlockGenerationDiagnosticCodeV1[]);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;
const UINT32_MAX = 4_294_967_295;
const ROUTE_REASON_CODES = Object.freeze([
  "user-selected-canonical",
  "hosted-native-not-admitted",
  "native-production-not-released",
  "reference-driven-distinctive-silhouette",
  "requires-canonical-route",
  "requires-deterministic-layout",
  "requires-world-change-set",
  "unsupported-dynamic-multilayer-surface",
  "unsupported-enclosed-topology",
  "user-selected-supported-lane",
] as const satisfies readonly SceneAuthoringRouteReasonCodeV1[]);
const NATIVE_FORBIDDEN_REASON_CODES = new Set<SceneAuthoringRouteReasonCodeV1>([
  "native-production-not-released",
  "hosted-native-not-admitted",
  "requires-canonical-route",
  "requires-world-change-set",
  "requires-deterministic-layout",
]);

type InvalidContract =
  | "route"
  | "attempt"
  | "result"
  | "generation-request"
  | "generation-receipt";

function invalidContract(contract: InvalidContract): never {
  if (contract === "route") {
    throw new TypeError(
      "SCENE_AUTHORING_ROUTE_DECISION_INVALID: value must match the closed SceneAuthoringRouteDecisionV1 contract",
    );
  }
  if (contract === "attempt") {
    throw new TypeError(
      "SCENE_AUTHORING_ATTEMPT_INVALID: value must match the closed SceneAuthoringAttemptV1 contract",
    );
  }
  if (contract === "generation-request") {
    throw new TypeError(
      "NATIVE_BLOCK_GENERATION_REQUEST_INVALID: value must match the closed NativeBlockGenerationRequestV1 contract",
    );
  }
  if (contract === "generation-receipt") {
    throw new TypeError(
      "NATIVE_BLOCK_GENERATION_RECEIPT_INVALID: value must match the closed NativeBlockGenerationReceiptV1 contract",
    );
  }
  throw new TypeError(
    "SCENE_AUTHORING_ATTEMPT_RESULT_INVALID: value must match the closed SceneAuthoringAttemptResultV1 contract",
  );
}

function snapshotDataRecord(
  input: unknown,
  contract: InvalidContract,
): Record<string, unknown> {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return invalidContract(contract);
  }
  try {
    if (Reflect.getPrototypeOf(input) !== Object.prototype) {
      return invalidContract(contract);
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return invalidContract(contract);
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return invalidContract(contract);
  }
}

function exactRecord(
  input: unknown,
  fields: readonly string[],
  contract: InvalidContract,
): Record<string, unknown> {
  const record = snapshotDataRecord(input, contract);
  const keys = Object.keys(record);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(record, field)) ||
    keys.some((field) => !fields.includes(field))
  ) {
    return invalidContract(contract);
  }
  return record;
}

function snapshotDataArray(
  input: unknown,
  contract: InvalidContract,
): readonly unknown[] {
  if (!Array.isArray(input)) return invalidContract(contract);
  try {
    if (Reflect.getPrototypeOf(input) !== Array.prototype) {
      return invalidContract(contract);
    }
    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== input.length + 1 ||
      keys.some((key) => {
        if (key === "length") return false;
        return typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key);
      })
    ) {
      return invalidContract(contract);
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
      if (
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return invalidContract(contract);
      }
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch {
    return invalidContract(contract);
  }
}

function canonicalString(
  input: unknown,
  contract: InvalidContract,
): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input ||
    input.normalize("NFC") !== input
  ) {
    return invalidContract(contract);
  }
  return input;
}

function sha256Hash(
  input: unknown,
  contract: InvalidContract,
): Sha256HashV1 {
  if (
    typeof input !== "string" ||
    !HASH_PATTERN.test(input) ||
    input === ZERO_HASH
  ) {
    return invalidContract(contract);
  }
  return input as Sha256HashV1;
}

function canonicalStringSet(
  input: unknown,
  contract: InvalidContract,
  options: Readonly<{ nonEmpty?: boolean }> = {},
): readonly string[] {
  const values = snapshotDataArray(input, contract).map((value) =>
    canonicalString(value, contract),
  );
  if (
    new Set(values).size !== values.length ||
    (options.nonEmpty === true && values.length === 0)
  ) {
    return invalidContract(contract);
  }
  return Object.freeze(sortBy(values));
}

function reasonCodeSet(
  input: unknown,
  contract: InvalidContract,
): readonly SceneAuthoringRouteReasonCodeV1[] {
  const values = canonicalStringSet(input, contract);
  if (
    values.some((value) =>
      !(ROUTE_REASON_CODES as readonly string[]).includes(value)
    )
  ) {
    return invalidContract(contract);
  }
  return values as readonly SceneAuthoringRouteReasonCodeV1[];
}

function positiveSafeInteger(
  input: unknown,
  contract: InvalidContract,
): number {
  if (
    typeof input !== "number" ||
    !Number.isSafeInteger(input) ||
    input <= 0
  ) {
    return invalidContract(contract);
  }
  return input;
}

function uint32SeedForContract(
  input: unknown,
  contract: InvalidContract,
): number {
  if (
    typeof input !== "number" ||
    !Number.isInteger(input) ||
    input < 0 ||
    input > UINT32_MAX ||
    Object.is(input, -0)
  ) {
    return invalidContract(contract);
  }
  return input;
}

function hasExactOrder(values: readonly string[], expected: readonly string[]): boolean {
  return values.length === expected.length &&
    values.every((value, index) => value === expected[index]);
}

function parseGenerationReferenceInputs(
  input: unknown,
): readonly NativeBlockGenerationReferenceInputV1[] {
  const values = snapshotDataArray(input, "generation-request").map((value) => {
    const record = exactRecord(
      value,
      GENERATION_REFERENCE_INPUT_FIELDS,
      "generation-request",
    );
    if (record.mediaType !== "image/png" && record.mediaType !== "image/jpeg" && record.mediaType !== "image/webp") {
      return invalidContract("generation-request");
    }
    return Object.freeze({
      inputRef: canonicalString(record.inputRef, "generation-request"),
      contentHash: sha256Hash(record.contentHash, "generation-request"),
      mediaType: record.mediaType,
    });
  });
  const refs = values.map(({ inputRef }) => inputRef);
  if (!hasExactOrder(refs, sortBy(refs)) || new Set(refs).size !== refs.length) {
    return invalidContract("generation-request");
  }
  return Object.freeze(values);
}

function parseGenerationContextInputs(
  input: unknown,
): readonly NativeBlockGenerationContextInputV1[] {
  const values = snapshotDataArray(input, "generation-request").map((value) => {
    const record = exactRecord(
      value,
      GENERATION_CONTEXT_INPUT_FIELDS,
      "generation-request",
    );
    return Object.freeze({
      inputRef: canonicalString(record.inputRef, "generation-request"),
      contentHash: sha256Hash(record.contentHash, "generation-request"),
    });
  });
  const refs = values.map(({ inputRef }) => inputRef);
  if (
    !hasExactOrder(refs, sortBy(refs)) ||
    new Set(refs).size !== refs.length ||
    refs.some((ref) =>
      ref.startsWith("/") ||
      ref.includes("\\") ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/.test(ref) ||
      /^[A-Za-z]:/.test(ref) ||
      ref.split("/").some((segment) => segment === "" || segment === ".." || segment === ".")
    )
  ) {
    return invalidContract("generation-request");
  }
  return Object.freeze(values);
}

function parseGenerationBudgets(input: unknown): NativeBlockGenerationBudgetV1 {
  const record = exactRecord(
    input,
    GENERATION_BUDGET_FIELDS,
    "generation-request",
  );
  return Object.freeze({
    maximumStaticColliderCount: positiveSafeInteger(
      record.maximumStaticColliderCount,
      "generation-request",
    ),
    maximumStaticColliderVertexCount: positiveSafeInteger(
      record.maximumStaticColliderVertexCount,
      "generation-request",
    ),
    maximumStaticColliderTriangleCount: positiveSafeInteger(
      record.maximumStaticColliderTriangleCount,
      "generation-request",
    ),
    maximumOutputBytes: positiveSafeInteger(
      record.maximumOutputBytes,
      "generation-request",
    ),
    timeoutSeconds: positiveSafeInteger(record.timeoutSeconds, "generation-request"),
  });
}

export function parseNativeBlockGenerationRequestV1(
  input: unknown,
): NativeBlockGenerationRequestV1 {
  const record = exactRecord(
    input,
    GENERATION_REQUEST_FIELDS,
    "generation-request",
  );
  if (
    record.kind !== "native-block-generation-request" ||
    record.schemaVersion !== 1 ||
    record.codexExecutionProfileRef !==
      "worldkit://codex-execution-profile/formal@1"
  ) {
    return invalidContract("generation-request");
  }
  const declaredOutputPaths = snapshotDataArray(
    record.declaredOutputPaths,
    "generation-request",
  ).map((value) => canonicalString(value, "generation-request"));
  if (!hasExactOrder(declaredOutputPaths, DECLARED_GENERATION_OUTPUT_PATHS)) {
    return invalidContract("generation-request");
  }
  return Object.freeze({
    kind: "native-block-generation-request",
    schemaVersion: 1,
    id: canonicalString(record.id, "generation-request"),
    routeDecisionRef: canonicalString(record.routeDecisionRef, "generation-request"),
    routeDecisionHash: sha256Hash(record.routeDecisionHash, "generation-request"),
    sceneBriefRef: canonicalString(record.sceneBriefRef, "generation-request"),
    sceneBriefHash: sha256Hash(record.sceneBriefHash, "generation-request"),
    referenceInputs: parseGenerationReferenceInputs(record.referenceInputs),
    codexExecutionProfileRef: canonicalString(
      record.codexExecutionProfileRef,
      "generation-request",
    ),
    codexExecutionProfileHash: sha256Hash(
      record.codexExecutionProfileHash,
      "generation-request",
    ),
    taskInstructionRef: canonicalString(record.taskInstructionRef, "generation-request"),
    taskInstructionHash: sha256Hash(record.taskInstructionHash, "generation-request"),
    builderSkillRef: canonicalString(record.builderSkillRef, "generation-request"),
    builderSkillHash: sha256Hash(record.builderSkillHash, "generation-request"),
    workspaceContextManifestRef: canonicalString(
      record.workspaceContextManifestRef,
      "generation-request",
    ),
    workspaceContextManifestHash: sha256Hash(
      record.workspaceContextManifestHash,
      "generation-request",
    ),
    contextInputs: parseGenerationContextInputs(record.contextInputs),
    nativeSceneApiRef: canonicalString(record.nativeSceneApiRef, "generation-request"),
    nativeSceneApiHash: sha256Hash(record.nativeSceneApiHash, "generation-request"),
    nativeSceneProfileRef: canonicalString(
      record.nativeSceneProfileRef,
      "generation-request",
    ),
    nativeSceneProfileHash: sha256Hash(
      record.nativeSceneProfileHash,
      "generation-request",
    ),
    blockProfileRef: canonicalString(record.blockProfileRef, "generation-request"),
    blockProfileHash: sha256Hash(record.blockProfileHash, "generation-request"),
    bootstrapInputRef: canonicalString(record.bootstrapInputRef, "generation-request"),
    bootstrapInputHash: sha256Hash(record.bootstrapInputHash, "generation-request"),
    seed: uint32SeedForContract(record.seed, "generation-request"),
    budgets: parseGenerationBudgets(record.budgets),
    declaredOutputPaths: DECLARED_GENERATION_OUTPUT_PATHS,
  });
}

export function nativeBlockGenerationRequestCanonicalBytesV1(
  input: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseNativeBlockGenerationRequestV1(input));
}

export function hashNativeBlockGenerationRequestV1(input: unknown): Sha256HashV1 {
  return sha256CanonicalJson(
    parseNativeBlockGenerationRequestV1(input),
  ) as Sha256HashV1;
}

function parseGenerationOutputs(
  input: unknown,
): readonly NativeBlockGenerationOutputV1[] {
  const outputs = snapshotDataArray(input, "generation-receipt").map((value) => {
    const record = exactRecord(
      value,
      GENERATION_OUTPUT_FIELDS,
      "generation-receipt",
    );
    if (!(SORTED_GENERATION_OUTPUT_PATHS as readonly unknown[]).includes(record.path)) {
      return invalidContract("generation-receipt");
    }
    const path = record.path as NativeBlockGenerationOutputV1["path"];
    const expectedMediaType = path === "scene.ts"
      ? "text/typescript"
      : "application/json";
    if (record.mediaType !== expectedMediaType) {
      return invalidContract("generation-receipt");
    }
    return Object.freeze({
      path,
      contentHash: sha256Hash(record.contentHash, "generation-receipt"),
      sizeBytes: positiveSafeInteger(record.sizeBytes, "generation-receipt"),
      mediaType: expectedMediaType,
    });
  });
  const paths = outputs.map(({ path }) => path);
  if (
    !hasExactOrder(paths, sortBy(paths)) ||
    new Set(paths).size !== paths.length
  ) {
    return invalidContract("generation-receipt");
  }
  return Object.freeze(outputs);
}

function parseGenerationDiagnosticCodes(
  input: unknown,
): readonly NativeBlockGenerationDiagnosticCodeV1[] {
  const values = snapshotDataArray(input, "generation-receipt").map((value) =>
    canonicalString(value, "generation-receipt")
  );
  if (
    !hasExactOrder(values, sortBy(values)) ||
    new Set(values).size !== values.length ||
    values.some((value) =>
      !(GENERATION_DIAGNOSTIC_CODES as readonly string[]).includes(value)
    )
  ) {
    return invalidContract("generation-receipt");
  }
  return Object.freeze(values as NativeBlockGenerationDiagnosticCodeV1[]);
}

export function parseNativeBlockGenerationReceiptV1(
  input: unknown,
): NativeBlockGenerationReceiptV1 {
  const record = exactRecord(
    input,
    GENERATION_RECEIPT_FIELDS,
    "generation-receipt",
  );
  if (
    record.kind !== "native-block-generation-receipt" ||
    record.schemaVersion !== 1 ||
    (record.backend !== "cloud" && record.backend !== "local") ||
    record.executionProfile !== "formal" ||
    record.resolvedModel !== "gpt-5.6-sol" ||
    record.resolvedReasoningEffort !== "xhigh" ||
    !["completed", "rejected", "tool-error", "unknown"].includes(
      record.outcome as string,
    ) ||
    (record.cleanupOutcome !== "completed" && record.cleanupOutcome !== "failed")
  ) {
    return invalidContract("generation-receipt");
  }
  const outputs = parseGenerationOutputs(record.outputs);
  const diagnosticCodes = parseGenerationDiagnosticCodes(record.diagnosticCodes);
  const hasTaskTimeout = diagnosticCodes.includes("task-timeout");
  const hasDefinitiveTaskTimeout =
    record.outcome === "rejected" &&
    diagnosticCodes.length === 1 &&
    record.cleanupOutcome === "completed";
  const hasTaskTimeoutWithCleanupFailure =
    record.outcome === "tool-error" &&
    diagnosticCodes.length === 2 &&
    diagnosticCodes[0] === "cleanup-failed" &&
    diagnosticCodes[1] === "task-timeout" &&
    record.cleanupOutcome === "failed";
  if (
    (record.outcome === "completed" &&
      (!hasExactOrder(outputs.map(({ path }) => path), SORTED_GENERATION_OUTPUT_PATHS) ||
        diagnosticCodes.length !== 0 ||
        record.cleanupOutcome !== "completed")) ||
    (record.outcome !== "completed" && diagnosticCodes.length === 0) ||
    (hasTaskTimeout &&
      (outputs.length !== 0 ||
        (!hasDefinitiveTaskTimeout && !hasTaskTimeoutWithCleanupFailure)))
  ) {
    return invalidContract("generation-receipt");
  }
  return Object.freeze({
    kind: "native-block-generation-receipt",
    schemaVersion: 1,
    id: canonicalString(record.id, "generation-receipt"),
    generationRequestRef: canonicalString(
      record.generationRequestRef,
      "generation-receipt",
    ),
    generationRequestHash: sha256Hash(
      record.generationRequestHash,
      "generation-receipt",
    ),
    routerTaskPayloadHash: sha256Hash(
      record.routerTaskPayloadHash,
      "generation-receipt",
    ),
    taskInstructionHash: sha256Hash(record.taskInstructionHash, "generation-receipt"),
    builderSkillHash: sha256Hash(record.builderSkillHash, "generation-receipt"),
    workspaceContextManifestHash: sha256Hash(
      record.workspaceContextManifestHash,
      "generation-receipt",
    ),
    routerRequestId: canonicalString(record.routerRequestId, "generation-receipt"),
    backend: record.backend,
    executionProfile: "formal",
    resolvedModel: "gpt-5.6-sol",
    resolvedReasoningEffort: "xhigh",
    outcome: record.outcome,
    outputs,
    diagnosticCodes,
    cleanupOutcome: record.cleanupOutcome,
  } as NativeBlockGenerationReceiptV1);
}

export function nativeBlockGenerationReceiptCanonicalBytesV1(
  input: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseNativeBlockGenerationReceiptV1(input));
}

export function hashNativeBlockGenerationReceiptV1(input: unknown): Sha256HashV1 {
  return sha256CanonicalJson(
    parseNativeBlockGenerationReceiptV1(input),
  ) as Sha256HashV1;
}

export function assertNativeBlockGenerationReceiptMatchesRequestV1(
  requestInput: unknown,
  receiptInput: unknown,
): void {
  try {
    const request = parseNativeBlockGenerationRequestV1(requestInput);
    const receipt = parseNativeBlockGenerationReceiptV1(receiptInput);
    if (
      receipt.generationRequestHash !== hashNativeBlockGenerationRequestV1(request) ||
      receipt.taskInstructionHash !== request.taskInstructionHash ||
      receipt.builderSkillHash !== request.builderSkillHash ||
      receipt.workspaceContextManifestHash !== request.workspaceContextManifestHash ||
      !hasExactOrder(
        receipt.outputs.map(({ path }) => path),
        SORTED_GENERATION_OUTPUT_PATHS,
      )
    ) {
      throw new Error("mismatch");
    }
  } catch {
    throw new TypeError(
      "NATIVE_BLOCK_GENERATION_RECEIPT_MISMATCH: receipt does not close the generation request identity",
    );
  }
}

/**
 * Closes a parsed Request against an Attempt. The immutable request ref is an
 * explicit input because canonical Request bytes deliberately do not contain
 * their artifact location.
 */
export function assertNativeBlockGenerationRequestMatchesAttemptV1(
  generationRequestRefInput: unknown,
  requestInput: unknown,
  attemptInput: unknown,
): void {
  try {
    const generationRequestRef = canonicalString(
      generationRequestRefInput,
      "generation-request",
    );
    const request = parseNativeBlockGenerationRequestV1(requestInput);
    const attempt = parseSceneAuthoringAttemptV1(attemptInput);
    if (
      attempt.sourceInput.kind !== "babylon-native" ||
      attempt.sceneAuthoringRouteDecisionRef !== request.routeDecisionRef ||
      attempt.sceneAuthoringRouteDecisionHash !== request.routeDecisionHash ||
      attempt.sceneBriefRef !== request.sceneBriefRef ||
      attempt.sceneBriefHash !== request.sceneBriefHash ||
      attempt.sourceInput.bootstrapInputRef !== request.bootstrapInputRef ||
      attempt.sourceInput.bootstrapInputHash !== request.bootstrapInputHash ||
      attempt.sourceInput.generationRequestHash !==
        hashNativeBlockGenerationRequestV1(request) ||
      attempt.sourceInput.generationRequestRef !== generationRequestRef ||
      attempt.seed !== request.seed
    ) {
      throw new Error("mismatch");
    }
  } catch {
    throw new TypeError(
      "NATIVE_BLOCK_GENERATION_REQUEST_ATTEMPT_MISMATCH: Request does not close the Native Scene Authoring Attempt identity",
    );
  }
}

function parseRouteDecisionMember(
  input: unknown,
): SceneAuthoringRouteDecisionV1["decision"] {
  const snapshot = snapshotDataRecord(input, "route");
  if (snapshot.kind === "canonical") {
    const record = exactRecord(snapshot, CANONICAL_DECISION_FIELDS, "route");
    return Object.freeze({
      kind: "canonical",
      authoringProfileRef: canonicalString(
        record.authoringProfileRef,
        "route",
      ),
      reasonCodes: reasonCodeSet(record.reasonCodes, "route"),
    });
  }
  if (snapshot.kind === "babylon-native") {
    const record = exactRecord(snapshot, NATIVE_DECISION_FIELDS, "route");
    if (
      record.compositionStrategy !== "ground-first" &&
      record.compositionStrategy !== "ground-first-with-locked-assets"
    ) {
      return invalidContract("route");
    }
    const reasonCodes = reasonCodeSet(record.reasonCodes, "route");
    if (reasonCodes.some((code) => NATIVE_FORBIDDEN_REASON_CODES.has(code))) {
      return invalidContract("route");
    }
    return Object.freeze({
      kind: "babylon-native",
      authoringProfileRef: canonicalString(
        record.authoringProfileRef,
        "route",
      ),
      compositionStrategy: record.compositionStrategy,
      reasonCodes,
    });
  }
  if (snapshot.kind === "capability-gap") {
    const record = exactRecord(snapshot, GAP_DECISION_FIELDS, "route");
    return Object.freeze({
      kind: "capability-gap",
      unsupportedCapabilityRefs: canonicalStringSet(
        record.unsupportedCapabilityRefs,
        "route",
        { nonEmpty: true },
      ),
      reasonCodes: reasonCodeSet(record.reasonCodes, "route"),
    });
  }
  return invalidContract("route");
}

export function parseSceneAuthoringRouteDecisionV1(
  input: unknown,
): SceneAuthoringRouteDecisionV1 {
  const record = exactRecord(input, ROUTE_FIELDS, "route");
  if (
    record.kind !== "scene-authoring-route-decision" ||
    record.schemaVersion !== 1
  ) {
    return invalidContract("route");
  }
  return Object.freeze({
    kind: "scene-authoring-route-decision",
    schemaVersion: 1,
    id: canonicalString(record.id, "route"),
    sceneBriefRef: canonicalString(record.sceneBriefRef, "route"),
    sceneBriefHash: sha256Hash(record.sceneBriefHash, "route"),
    trustProfileRef: canonicalString(record.trustProfileRef, "route"),
    trustProfileHash: sha256Hash(record.trustProfileHash, "route"),
    requiredCapabilityRefs: canonicalStringSet(
      record.requiredCapabilityRefs,
      "route",
    ),
    decision: parseRouteDecisionMember(record.decision),
  });
}

export function sceneAuthoringRouteDecisionCanonicalBytesV1(
  input: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseSceneAuthoringRouteDecisionV1(input));
}

export function hashSceneAuthoringRouteDecisionV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseSceneAuthoringRouteDecisionV1(input),
  ) as Sha256HashV1;
}

const NATIVE_UNSUPPORTED_CAPABILITY_REASON_BY_REF = Object.freeze({
  "worldkit://capability/world-change-set@1": "requires-world-change-set",
  "worldkit://capability/route.nav@1": "requires-canonical-route",
  "worldkit://capability/dynamic-multilayer-surface@1":
    "unsupported-dynamic-multilayer-surface",
} as const satisfies Readonly<Record<string, SceneAuthoringRouteReasonCodeV1>>);

export function decideSceneAuthoringRouteV1(
  input: DecideSceneAuthoringRouteV1Input,
): SceneAuthoringRouteDecisionV1 {
  const record = exactRecord(input, ROUTE_INPUT_FIELDS, "route");
  if (
    (record.requestedSourceKind !== "canonical" &&
      record.requestedSourceKind !== "babylon-native") ||
    typeof record.nativeTrustAdmitted !== "boolean" ||
    typeof record.referenceDrivenDistinctiveSilhouette !== "boolean"
  ) {
    return invalidContract("route");
  }
  const requiredCapabilityRefs = Object.freeze(sortBy([
    ...new Set(
      snapshotDataArray(record.requiredCapabilityRefs, "route").map((value) =>
        canonicalString(value, "route"),
      ),
    ),
  ]));
  const common = {
    kind: "scene-authoring-route-decision" as const,
    schemaVersion: 1 as const,
    id: canonicalString(record.id, "route"),
    sceneBriefRef: canonicalString(record.sceneBriefRef, "route"),
    sceneBriefHash: sha256Hash(record.sceneBriefHash, "route"),
    trustProfileRef: canonicalString(record.trustProfileRef, "route"),
    trustProfileHash: sha256Hash(record.trustProfileHash, "route"),
    requiredCapabilityRefs,
  };
  if (record.requestedSourceKind === "canonical") {
    return parseSceneAuthoringRouteDecisionV1({
      ...common,
      decision: {
        kind: "canonical",
        authoringProfileRef:
          "worldkit://authoring-profile/canonical-outdoor@1",
        reasonCodes: ["user-selected-canonical"],
      },
    });
  }
  const unsupportedCapabilityRefs = requiredCapabilityRefs.filter((ref) =>
    Object.hasOwn(NATIVE_UNSUPPORTED_CAPABILITY_REASON_BY_REF, ref),
  );
  if (record.nativeTrustAdmitted === false) {
    unsupportedCapabilityRefs.push(
      "worldkit://capability/hosted-native-admission@1",
    );
  }
  if (unsupportedCapabilityRefs.length > 0) {
    const reasonCodes = unsupportedCapabilityRefs.map((ref) =>
      ref === "worldkit://capability/hosted-native-admission@1"
        ? "hosted-native-not-admitted"
        : NATIVE_UNSUPPORTED_CAPABILITY_REASON_BY_REF[
          ref as keyof typeof NATIVE_UNSUPPORTED_CAPABILITY_REASON_BY_REF
        ],
    );
    return parseSceneAuthoringRouteDecisionV1({
      ...common,
      decision: {
        kind: "capability-gap",
        unsupportedCapabilityRefs,
        reasonCodes,
      },
    });
  }
  return parseSceneAuthoringRouteDecisionV1({
    ...common,
    decision: {
      kind: "babylon-native",
      authoringProfileRef:
        "worldkit://native-authoring-profile/whitebox.blocks@1",
      compositionStrategy: "ground-first",
      reasonCodes: [
        ...(record.referenceDrivenDistinctiveSilhouette === true
          ? ["reference-driven-distinctive-silhouette" as const]
          : []),
        "user-selected-supported-lane",
      ],
    },
  });
}

function parseAttemptSource(
  input: unknown,
): SceneAuthoringAttemptV1["sourceInput"] {
  const snapshot = snapshotDataRecord(input, "attempt");
  if (snapshot.kind === "canonical") {
    const record = exactRecord(snapshot, CANONICAL_SOURCE_FIELDS, "attempt");
    return Object.freeze({
      kind: "canonical",
      authoringInputRef: canonicalString(record.authoringInputRef, "attempt"),
      authoringInputHash: sha256Hash(record.authoringInputHash, "attempt"),
    });
  }
  if (snapshot.kind === "babylon-native") {
    const record = exactRecord(snapshot, NATIVE_SOURCE_FIELDS, "attempt");
    return Object.freeze({
      kind: "babylon-native",
      bootstrapInputRef: canonicalString(record.bootstrapInputRef, "attempt"),
      bootstrapInputHash: sha256Hash(record.bootstrapInputHash, "attempt"),
      generationRequestRef: canonicalString(
        record.generationRequestRef,
        "attempt",
      ),
      generationRequestHash: sha256Hash(
        record.generationRequestHash,
        "attempt",
      ),
    });
  }
  return invalidContract("attempt");
}

function parseSelectedAssets(
  input: unknown,
): readonly SceneAuthoringSelectedAssetResourceV1[] {
  const assets = snapshotDataArray(input, "attempt").map((value) => {
    const record = exactRecord(value, SELECTED_ASSET_FIELDS, "attempt");
    return Object.freeze({
      assetResourceRef: canonicalString(record.assetResourceRef, "attempt"),
      assetPublicationReceiptRef: canonicalString(
        record.assetPublicationReceiptRef,
        "attempt",
      ),
      assetPublicationReceiptHash: sha256Hash(
        record.assetPublicationReceiptHash,
        "attempt",
      ),
    });
  });
  const assetRefs = assets.map((asset) => asset.assetResourceRef);
  const receiptRefs = assets.map((asset) => asset.assetPublicationReceiptRef);
  if (
    new Set(assetRefs).size !== assetRefs.length ||
    new Set(receiptRefs).size !== receiptRefs.length
  ) {
    return invalidContract("attempt");
  }
  return Object.freeze(
    sortBy(
      assets,
      (asset) => asset.assetResourceRef,
      (asset) => asset.assetPublicationReceiptRef,
      (asset) => asset.assetPublicationReceiptHash,
    ),
  );
}

function uint32Seed(input: unknown): number {
  if (
    typeof input !== "number" ||
    !Number.isInteger(input) ||
    input < 0 ||
    input > UINT32_MAX ||
    Object.is(input, -0)
  ) {
    return invalidContract("attempt");
  }
  return input;
}

export function parseSceneAuthoringAttemptV1(
  input: unknown,
): SceneAuthoringAttemptV1 {
  const record = exactRecord(input, ATTEMPT_FIELDS, "attempt");
  if (
    record.kind !== "scene-authoring-attempt" ||
    record.schemaVersion !== 1
  ) {
    return invalidContract("attempt");
  }
  const sourceInput = parseAttemptSource(record.sourceInput);
  const acceptanceTargetRefs = canonicalStringSet(
    record.acceptanceTargetRefs,
    "attempt",
  );
  const requiredEvidenceProfileRefs = canonicalStringSet(
    record.requiredEvidenceProfileRefs,
    "attempt",
  );
  if (
    sourceInput.kind === "babylon-native" &&
    (acceptanceTargetRefs.length === 0 || requiredEvidenceProfileRefs.length === 0)
  ) {
    return invalidContract("attempt");
  }
  return Object.freeze({
    kind: "scene-authoring-attempt",
    schemaVersion: 1,
    id: canonicalString(record.id, "attempt"),
    sceneAuthoringRouteDecisionRef: canonicalString(
      record.sceneAuthoringRouteDecisionRef,
      "attempt",
    ),
    sceneAuthoringRouteDecisionHash: sha256Hash(
      record.sceneAuthoringRouteDecisionHash,
      "attempt",
    ),
    sceneBriefRef: canonicalString(record.sceneBriefRef, "attempt"),
    sceneBriefHash: sha256Hash(record.sceneBriefHash, "attempt"),
    sourceInput,
    selectedAssetResources: parseSelectedAssets(record.selectedAssetResources),
    seed: uint32Seed(record.seed),
    authoringProfileRef: canonicalString(
      record.authoringProfileRef,
      "attempt",
    ),
    acceptanceTargetRefs,
    requiredEvidenceProfileRefs,
  });
}

export function sceneAuthoringAttemptCanonicalBytesV1(
  input: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseSceneAuthoringAttemptV1(input));
}

export function hashSceneAuthoringAttemptV1(input: unknown): Sha256HashV1 {
  return sha256CanonicalJson(
    parseSceneAuthoringAttemptV1(input),
  ) as Sha256HashV1;
}

export function parseSceneAuthoringAttemptResultV1(
  input: unknown,
): SceneAuthoringAttemptResultV1 {
  const snapshot = snapshotDataRecord(input, "result");
  if (snapshot.outcome === "completed") {
    const record = exactRecord(snapshot, COMPLETED_RESULT_FIELDS, "result");
    if (
      record.kind !== "scene-authoring-attempt-result" ||
      record.schemaVersion !== 1
    ) {
      return invalidContract("result");
    }
    return Object.freeze({
      kind: "scene-authoring-attempt-result",
      schemaVersion: 1,
      id: canonicalString(record.id, "result"),
      sceneAuthoringAttemptRef: canonicalString(
        record.sceneAuthoringAttemptRef,
        "result",
      ),
      sceneAuthoringAttemptHash: sha256Hash(
        record.sceneAuthoringAttemptHash,
        "result",
      ),
      outcome: "completed",
      authoredSourceRef: canonicalString(record.authoredSourceRef, "result"),
      authoredSourceHash: sha256Hash(record.authoredSourceHash, "result"),
      evidenceRefs: canonicalStringSet(record.evidenceRefs, "result"),
    });
  }
  if (snapshot.outcome === "rejected" || snapshot.outcome === "tool-error") {
    const outcome = snapshot.outcome;
    const record = exactRecord(snapshot, FAILED_RESULT_FIELDS, "result");
    if (
      record.kind !== "scene-authoring-attempt-result" ||
      record.schemaVersion !== 1
    ) {
      return invalidContract("result");
    }
    return Object.freeze({
      kind: "scene-authoring-attempt-result",
      schemaVersion: 1,
      id: canonicalString(record.id, "result"),
      sceneAuthoringAttemptRef: canonicalString(
        record.sceneAuthoringAttemptRef,
        "result",
      ),
      sceneAuthoringAttemptHash: sha256Hash(
        record.sceneAuthoringAttemptHash,
        "result",
      ),
      outcome,
      diagnosticRefs: canonicalStringSet(record.diagnosticRefs, "result"),
    });
  }
  return invalidContract("result");
}

export function sceneAuthoringAttemptResultCanonicalBytesV1(
  input: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseSceneAuthoringAttemptResultV1(input));
}

export function hashSceneAuthoringAttemptResultV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseSceneAuthoringAttemptResultV1(input),
  ) as Sha256HashV1;
}

export function firstInvalidatedSceneAuthoringGateV1(
  previous: unknown,
  next: unknown,
): SceneAuthoringInvalidatedGateV1 {
  const parsedPrevious = parseSceneAuthoringAttemptV1(previous);
  const parsedNext = parseSceneAuthoringAttemptV1(next);
  if (
    parsedPrevious.sceneAuthoringRouteDecisionRef !==
      parsedNext.sceneAuthoringRouteDecisionRef ||
    parsedPrevious.sceneAuthoringRouteDecisionHash !==
      parsedNext.sceneAuthoringRouteDecisionHash
  ) {
    return "route-decision";
  }
  return stringifyCanonicalJson(parsedPrevious) ===
    stringifyCanonicalJson(parsedNext)
    ? "none"
    : "source-authoring";
}
