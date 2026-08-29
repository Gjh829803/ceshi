import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { isNil, sortBy } from "lodash-es";

export type SceneAuthoringRouteReasonCodeV1 =
  | "canonical-default"
  | "native-production-not-released"
  | "hosted-native-not-admitted"
  | "requires-canonical-route"
  | "requires-world-change-set"
  | "requires-deterministic-layout"
  | "reference-driven-distinctive-silhouette"
  | "unsupported-enclosed-topology"
  | "unsupported-dynamic-multilayer-surface"
  | "user-selected-supported-lane";

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
        moduleGenerationInputRef: string;
        moduleGenerationInputHash: Sha256HashV1;
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
  "moduleGenerationInputRef",
  "moduleGenerationInputHash",
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
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;
const UINT32_MAX = 4_294_967_295;
const ROUTE_REASON_CODES = Object.freeze([
  "canonical-default",
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
  | "result";

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
      moduleGenerationInputRef: canonicalString(
        record.moduleGenerationInputRef,
        "attempt",
      ),
      moduleGenerationInputHash: sha256Hash(
        record.moduleGenerationInputHash,
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
    sourceInput: parseAttemptSource(record.sourceInput),
    selectedAssetResources: parseSelectedAssets(record.selectedAssetResources),
    seed: uint32Seed(record.seed),
    authoringProfileRef: canonicalString(
      record.authoringProfileRef,
      "attempt",
    ),
    acceptanceTargetRefs: canonicalStringSet(
      record.acceptanceTargetRefs,
      "attempt",
    ),
    requiredEvidenceProfileRefs: canonicalStringSet(
      record.requiredEvidenceProfileRefs,
      "attempt",
    ),
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
